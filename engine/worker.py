"""Renders the App Ad Studio's queued previews and packs.

Polls the ForgeLabs Supabase project for a job (studio_claim_job), downloads the customer's
uploads, runs the engine, uploads the results to studio-renders/{owner}/{batch}/{job}/ and
reports back (studio_finish_job). One job at a time.

    .venv/bin/python worker.py            runs until stopped (Ctrl-C)
    .venv/bin/python worker.py --once     takes one job if there is one, then exits

Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ELEVENLABS_API_KEY from the environment, or
from .env.local at the repo root. The service role key bypasses row level security, so a job is
treated as untrusted input: every upload path must sit in the job owner's own folder, voices
come from a fixed list, and text lengths and counts are capped before the engine sees them.
"""
import json
import mimetypes
import os
import re
import shutil
import socket
import sys
import tempfile
import time
import traceback

import requests
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from forge_engine import job as jobs, pack  # noqa: E402

Image.MAX_IMAGE_PIXELS = 40_000_000  # a phone screenshot is under 4 million

VOICES = {  # the voices the app offers (assets/studio.js)
    'JBFqnCBsd6RMkjVDRZzb', 'Xb7hH8MSUJpSbSDYk0k2', 'nPczCjzI2devNBz1zQrb', 'EXAVITQu4vr4xnSDxMaL',
    'TX3LPaxmHKxFdv7VOQHJ', 'cgSgspJ2msm6clMCkdW9', 'IKne3meq5aSn9XLyUdCD', 'SAz9YHcvj6GT2YYXdXww',
}
MOTIONS = {'rise', 'page', 'zoom', 'play'}
HEX = re.compile(r'^#[0-9a-fA-F]{6}$')
MAX_UPLOAD = 60 * 1024 * 1024


def load_env():
    path = os.path.join(os.path.dirname(HERE), '.env.local')
    if not os.path.exists(path):
        return
    for line in open(path):
        m = re.match(r'^([A-Z0-9_]+)=(.*)$', line.strip())
        if m and m.group(1) not in os.environ:
            os.environ[m.group(1)] = m.group(2)


class Supabase:
    def __init__(self):
        self.url = os.environ.get('SUPABASE_URL', 'https://cuijqoorjgvlyiyizgxi.supabase.co').rstrip('/')
        key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
        if not key:
            sys.exit('SUPABASE_SERVICE_ROLE_KEY is not set (add it to .env.local)')
        self.s = requests.Session()
        self.s.headers.update({'apikey': key, 'Authorization': f'Bearer {key}'})

    def rpc(self, name, args):
        r = self.s.post(f'{self.url}/rest/v1/rpc/{name}', json=args, timeout=60)
        if r.status_code >= 300:
            raise RuntimeError(f'{name} failed ({r.status_code}): {r.text[:300]}')
        return r.json() if r.text else None

    def get(self, table, query):
        r = self.s.get(f'{self.url}/rest/v1/{table}?{query}', timeout=60)
        r.raise_for_status()
        return r.json()

    def download(self, bucket, path, dest):
        with self.s.get(f'{self.url}/storage/v1/object/{bucket}/{path}', stream=True, timeout=120) as r:
            if r.status_code != 200:
                raise ValueError(f'An upload is missing ({path.rsplit("/", 1)[-1]}). Upload it again.')
            size = 0
            with open(dest, 'wb') as f:
                for chunk in r.iter_content(1 << 20):
                    size += len(chunk)
                    if size > MAX_UPLOAD:
                        raise ValueError('An upload is larger than 60 MB.')
                    f.write(chunk)

    def upload(self, bucket, path, src):
        ctype = mimetypes.guess_type(src)[0] or 'application/octet-stream'
        with open(src, 'rb') as f:
            r = self.s.post(f'{self.url}/storage/v1/object/{bucket}/{path}', data=f,
                            headers={'Content-Type': ctype, 'x-upsert': 'true'}, timeout=300)
        if r.status_code >= 300:
            raise RuntimeError(f'upload of {path} failed ({r.status_code}): {r.text[:200]}')


def text(v, n):
    return re.sub(r'\s+', ' ', str(v or '')).strip()[:n]


def build_job(spec, owner, workdir, sb):
    """Checks a batch spec from the browser and turns it into an engine job with local files."""
    brand = spec.get('brand') or {}
    theme = brand.get('theme') or {}
    t = {'style': 'light' if theme.get('style') == 'light' else 'dark'}
    for k in ('accent', 'bg'):
        if HEX.match(str(theme.get(k) or '')):
            t[k] = theme[k]
    data = {
        'brand': {'name': text(brand.get('name'), 60) or 'Your app',
                  'spoken_name': text(brand.get('spoken_name'), 80) or None, 'theme': t},
        'screens': {}, 'hooks': [], 'body': [],
    }
    screens = spec.get('screens') or {}
    if len(screens) > 30:
        raise ValueError('Use 30 screens or fewer.')
    os.makedirs(os.path.join(workdir, 'up'), exist_ok=True)
    keys = {}
    for i, (key, s) in enumerate(screens.items()):
        path = str(s.get('path') or '')
        if not path.startswith(f'{owner}/') or '..' in path or '//' in path:
            raise ValueError('A screen belongs to another account.')
        kind = s.get('kind') if s.get('kind') in ('image', 'video', 'icon') else 'image'
        ext = os.path.splitext(path)[1].lower()
        if ext not in ('.png', '.jpg', '.jpeg', '.webp', '.mp4', '.mov'):
            raise ValueError('Screens must be PNG, JPEG, WebP, MP4 or MOV.')
        local = os.path.join('up', f'{i}{ext}')
        sb.download('studio-uploads', path, os.path.join(workdir, local))
        if kind != 'video':
            with Image.open(os.path.join(workdir, local)) as im:
                im.verify()
        k = f's{i}'
        keys[str(key)] = k
        data['screens'][k] = {'path': local, 'kind': kind, 'status_bar': bool(s.get('status_bar', True))}
    icon = brand.get('icon')
    if icon and str(icon) in keys:
        data['brand']['icon'] = keys[str(icon)]

    def screen(key):
        return keys.get(str(key)) if key else None

    hooks = spec.get('hooks') or []
    if not 1 <= len(hooks) <= 5:
        raise ValueError('Pick between one and five hooks.')
    seen = set()
    for i, h in enumerate(hooks):
        hid = re.sub(r'[^a-z0-9-]+', '-', str(h.get('id') or f'hook-{i + 1}').lower()).strip('-')[:40] or f'hook-{i + 1}'
        while hid in seen:
            hid += '-2'
        seen.add(hid)
        say = text(h.get('say'), 160)
        if len(say) < 3:
            raise ValueError('Every hook needs words.')
        item = {'id': hid, 'say': say, 'benefit': text(h.get('benefit'), 140)}
        if screen(h.get('screen')):
            item['screen'] = screen(h.get('screen'))
        if isinstance(h.get('accent_from'), int) and 1 <= h['accent_from'] <= 30:
            item['accent_from'] = h['accent_from']
        data['hooks'].append(item)

    body = spec.get('body') or []
    if not 1 <= len(body) <= 6:
        raise ValueError('The script needs one to six scenes.')
    for s in body:
        key = screen(s.get('screen'))
        if not key:
            raise ValueError('Every scene needs one of your screens.')
        scene = {'say': text(s.get('say'), 200), 'head': text(s.get('head'), 40), 'screen': key,
                 'motion': s.get('motion') if s.get('motion') in MOTIONS else 'rise'}
        if not scene['say']:
            raise ValueError('Every scene needs words.')
        z = s.get('zoom')
        if scene['motion'] == 'zoom' and isinstance(z, list) and len(z) == 2 and all(isinstance(x, (int, float)) for x in z):
            a, b = max(0.0, min(1.0, float(z[0]))), max(0.0, min(1.0, float(z[1])))
            scene['zoom'] = [a, b] if b - a >= .1 else [.2, .6]
        data['body'].append(scene)

    op = spec.get('opening') or {}
    style = op.get('style') if op.get('style') in ('hand', 'phone', 'rise') else 'hand'
    data['opening'] = {'style': style, 'motion': 'page',
                       'screens': [screen(k) for k in (op.get('screens') or [])[:3] if screen(k)]}
    cta = spec.get('cta') or {}
    data['cta'] = {'say': text(cta.get('say'), 200), 'button': text(cta.get('button'), 40) or 'Download free on the App Store',
                   'lines': [text(l, 60) for l in (cta.get('lines') or [])[:2] if text(l, 60)],
                   'headline': text(cta.get('headline'), 60) or None}
    if not data['cta']['headline']:
        del data['cta']['headline']
    v = spec.get('voice') or {}
    data['voice'] = {'id': v.get('id') if v.get('id') in VOICES else 'JBFqnCBsd6RMkjVDRZzb'}
    if isinstance(v.get('speed'), (int, float)):
        data['voice']['speed'] = max(.85, min(1.2, float(v['speed'])))
    if text(spec.get('disclaimer'), 120):
        data['disclaimer'] = text(spec.get('disclaimer'), 120)
    with open(os.path.join(workdir, 'job.json'), 'w') as f:
        json.dump(data, f, indent=2)
    return jobs.Job(data, workdir)


def run(sb, job_row, name):
    jid, owner, kind = job_row['id'], job_row['owner'], job_row['kind']
    batch = sb.get('studio_batches', f'id=eq.{job_row["batch_id"]}&select=id,spec,owner')[0]
    if batch['owner'] != owner:
        raise ValueError('That pack belongs to another account.')
    workdir = tempfile.mkdtemp(prefix=f'studio-{jid[:8]}-')
    last = [0.0]

    def log(msg):
        print(f'  {msg}', flush=True)
        if time.time() - last[0] > 2:
            last[0] = time.time()
            try:
                sb.rpc('studio_job_progress', {'p_job': jid, 'p_text': msg})
            except Exception:
                pass

    try:
        log('Fetching your screens')
        job = build_job(batch['spec'], owner, workdir, sb)
        out = os.path.join(workdir, 'out')
        if kind == 'preview':
            log('Drawing the review frames')
            manifest = pack.make_preview(job, out, log=log)
        else:
            log('Recording the voiceovers')
            manifest = pack.make_pack(job, out, log=log, workdir=workdir)
        base = f'{owner}/{batch["id"]}/{jid}'
        files = []
        for root, _, names in os.walk(out):
            for n in sorted(names):
                # Storage keys always use '/', even on a Windows worker
                rel = os.path.relpath(os.path.join(root, n), out).replace(os.sep, '/')
                files.append(rel)
        log(f'Uploading {len(files)} files')
        for rel in files:
            sb.upload('studio-renders', f'{base}/{rel}', os.path.join(out, rel))
        return {'base': base, 'files': files, 'manifest': manifest}
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def main():
    load_env()
    sb = Supabase()
    name = f'{socket.gethostname()}-{os.getpid()}'
    once = '--once' in sys.argv
    print(f'worker {name} polling {sb.url}', flush=True)
    while True:
        try:
            rows = sb.rpc('studio_claim_job', {'p_worker': name}) or []
        except Exception as e:
            print('claim failed:', e, flush=True)
            rows = []
        if not rows:
            if once:
                return 0
            time.sleep(5)
            continue
        row = rows[0]
        print(f'job {row["id"]} ({row["kind"]}) for {row["owner"]}', flush=True)
        t0 = time.time()
        try:
            result = run(sb, row, name)
            sb.rpc('studio_finish_job', {'p_job': row['id'], 'p_ok': True, 'p_result': result, 'p_error': None})
            print(f'  done in {time.time() - t0:.0f}s', flush=True)
        except Exception as e:
            traceback.print_exc()
            msg = str(e) if isinstance(e, (ValueError, jobs.JobError)) else 'Something went wrong while rendering. Try again, and tell us if it keeps happening.'
            try:
                sb.rpc('studio_finish_job', {'p_job': row['id'], 'p_ok': False, 'p_result': None, 'p_error': msg[:300]})
            except Exception as e2:
                print('could not report the failure:', e2, flush=True)
        if once:
            return 0


if __name__ == '__main__':
    sys.exit(main())
