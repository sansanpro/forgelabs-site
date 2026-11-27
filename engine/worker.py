"""Renders the App Ad Studio's queued previews and packs.

Polls the ForgeLabs Supabase project for a job (studio_claim_job), downloads the customer's
uploads, runs the engine, uploads the results to studio-renders/{owner}/{batch}/{job}/ and
reports back (studio_finish_job). One job at a time.

    .venv/bin/python worker.py            runs until stopped (Ctrl-C)
    .venv/bin/python worker.py --once     takes one job if there is one, then exits

Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ELEVENLABS_API_KEY and ANTHROPIC_API_KEY (optional:
the director and the quality check) from the environment, or from .env.local at the repo root. The service role key bypasses row level security, so a job is
treated as untrusted input: every upload path must sit in the job owner's own folder, voices
come from a fixed list, recordings are decoded once under a time limit, and text lengths and
counts are capped before the engine sees them.

Email (optional): with SMTP_USER and SMTP_PASSWORD set (SMTP_HOST and SMTP_PORT default to
Google's smtp.gmail.com:587, MAIL_FROM to SMTP_USER), customers hear when a pack is ready or
failed (MAIL_CUSTOMERS=0 turns that off), and ALERT_EMAIL hears when a pack fails or goes out
without its quality check. Without them, those messages only go to the log.
"""
import json
import mimetypes
import os
import re
import shutil
import smtplib
import socket
import sys
import tempfile
import threading
import time
import traceback
from email.message import EmailMessage

import requests
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from forge_engine import agents, job as jobs, pack, render  # noqa: E402

Image.MAX_IMAGE_PIXELS = 40_000_000  # a phone screenshot is under 4 million

VOICES = {  # the voices the app offers (assets/studio.js)
    'JBFqnCBsd6RMkjVDRZzb', 'Xb7hH8MSUJpSbSDYk0k2', 'nPczCjzI2devNBz1zQrb', 'EXAVITQu4vr4xnSDxMaL',
    'TX3LPaxmHKxFdv7VOQHJ', 'cgSgspJ2msm6clMCkdW9', 'IKne3meq5aSn9XLyUdCD', 'SAz9YHcvj6GT2YYXdXww',
}
MOTIONS = {'rise', 'page', 'zoom', 'play'}
HEX = re.compile(r'^#[0-9a-fA-F]{6}$')
MAX_UPLOAD = 60 * 1024 * 1024
SITE = 'https://forgelaboratory.net'
SUPPORT = 'hassan@forgelaboratory.net'


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
        if kind == 'video':
            render.check_recording(os.path.join(workdir, local))
        else:
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
        if s.get('auto') is True:
            scene['auto'] = True  # the director may choose this scene's move
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
    on = spec.get('effects') is not False  # typing text and camera moves
    data['effects'] = {'type': on, 'camera': on, 'sfx': spec.get('sfx') is True}
    b = spec.get('brief') or {}  # what the director and the quality check judge claims against
    data['brief'] = {k: text(b.get(k), n) for k, n in (('one_liner', 300), ('comparison', 200), ('category', 80))}
    with open(os.path.join(workdir, 'job.json'), 'w') as f:
        json.dump(data, f, indent=2)
    return jobs.Job(data, workdir)


def directed(sb, job, path, workdir, log):
    """The director's choices (forge_engine/agents.py), made once per batch and kept in storage, so
    the pack matches the preview the customer approved."""
    local = os.path.join(workdir, 'direction.json')
    try:
        sb.download('studio-renders', path, local)
        with open(local) as f:
            return agents.apply_direction(job, json.load(f))
    except (ValueError, KeyError, TypeError):
        pass  # not directed yet, or a direction from an older format
    job, answer = pack.direct(job, log)
    if answer:
        with open(local, 'w') as f:
            json.dump(answer, f)
        try:
            sb.upload('studio-renders', path, local)
        except Exception as e:
            print('could not save the direction:', e, flush=True)
    return job


def heartbeat(jid, last, stop):
    """Keeps a running job's lock fresh every 30 seconds, whether or not the engine is logging,
    so a long voice or encode step never looks like a dead worker and gets rendered twice."""
    beat = Supabase()  # its own connection: requests sessions aren't shared between threads
    while not stop.wait(30):
        try:
            beat.rpc('studio_job_progress', {'p_job': jid, 'p_text': last[1]})
        except Exception:
            pass


def run(sb, job_row, name):
    jid, owner, kind = job_row['id'], job_row['owner'], job_row['kind']
    batch = sb.get('studio_batches', f'id=eq.{job_row["batch_id"]}&select=id,spec,owner')[0]
    if batch['owner'] != owner:
        raise ValueError('That pack belongs to another account.')
    workdir = tempfile.mkdtemp(prefix=f'studio-{jid[:8]}-')
    last = [0.0, 'Working']
    stop = threading.Event()
    threading.Thread(target=heartbeat, args=(jid, last, stop), daemon=True).start()

    def log(msg):
        print(f'  {msg}', flush=True)
        last[1] = msg
        if time.time() - last[0] > 2:
            last[0] = time.time()
            try:
                sb.rpc('studio_job_progress', {'p_job': jid, 'p_text': msg})
            except Exception:
                pass

    try:
        log('Fetching your screens')
        job = build_job(batch['spec'], owner, workdir, sb)
        job = directed(sb, job, f'{owner}/{batch["id"]}/direction.json', workdir, log)
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
        stop.set()
        shutil.rmtree(workdir, ignore_errors=True)


def send_mail(to, subject, body):
    """A plain-text email through SMTP (see the module docstring). False, and a log line, when
    there are no SMTP settings or sending fails: email never stops a render."""
    user, password = os.environ.get('SMTP_USER'), os.environ.get('SMTP_PASSWORD')
    if not (user and password and to):
        print(f'  (no email sent: {subject})', flush=True)
        return False
    msg = EmailMessage()
    msg['From'] = os.environ.get('MAIL_FROM') or f'ForgeLabs <{user}>'
    msg['To'], msg['Subject'] = to, subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(os.environ.get('SMTP_HOST', 'smtp.gmail.com'), int(os.environ.get('SMTP_PORT', '587')), timeout=30) as s:
            s.starttls()
            s.login(user, password)
            s.send_message(msg)
        return True
    except Exception as e:
        print('  email failed:', e, flush=True)
        return False


def alert(subject, body):
    send_mail(os.environ.get('ALERT_EMAIL'), f'[ForgeLabs worker] {subject}', body)


def tell_customer(sb, row, ok, error=None):
    """Emails a pack's owner that it's ready, or that it failed and wasn't charged."""
    if row['kind'] != 'pack' or os.environ.get('MAIL_CUSTOMERS') == '0' or not os.environ.get('SMTP_USER'):
        return
    try:
        email = sb.get('studio_accounts', f'id=eq.{row["owner"]}&select=email')[0]['email']
        b = sb.get('studio_batches', f'id=eq.{row["batch_id"]}&select=project_id,spec')[0]
    except Exception as e:
        print('  could not look up who to email:', e, flush=True)
        return
    app = text((b['spec'].get('brand') or {}).get('name'), 60) or 'your app'
    link = f'{SITE}/app/#/app/{b["project_id"]}/make'
    if ok:
        send_mail(email, f'Your ads for {app} are ready',
                  f'Your test pack for {app} is ready to download:\n{link}\n\n'
                  'Watch every video once with sound on and once with it off, and check every claim is\n'
                  'true today, before you run them.\n\nForgeLabs App Ad Studio\n')
    else:
        send_mail(email, f"Your ad pack for {app} didn't finish",
                  f"Your test pack for {app} didn't finish: {error}\n\n"
                  f"It didn't use up your pack. Open the Studio to try again:\n{link}\n\n"
                  f'If it keeps happening, email {SUPPORT}.\n\nForgeLabs App Ad Studio\n')


def finish(sb, row, name, ok, result, error):
    """Reports how a job ended, trying again through a network blip. False when the job wasn't
    this worker's to finish any more: another worker took it over after this one went quiet."""
    args = {'p_job': row['id'], 'p_ok': ok, 'p_result': result, 'p_error': error, 'p_worker': name}
    for wait in (2, 5, 15, 30, None):
        try:
            return sb.rpc('studio_finish_job', args) is not False
        except (RuntimeError, requests.RequestException) as e:
            if 'PGRST202' in str(e) and 'p_worker' in args:
                args.pop('p_worker')  # a database from before p_worker: finish the old way
                continue
            if wait is None:
                raise
            print(f'  reporting the result failed ({e}); trying again in {wait}s', flush=True)
            time.sleep(wait)


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
        except Exception as e:
            trace = traceback.format_exc()
            print(trace, flush=True)
            known = isinstance(e, (ValueError, jobs.JobError))
            msg = (str(e) if known else 'Something went wrong while rendering. Try again, and tell us if it keeps happening.')[:300]
            try:
                if finish(sb, row, name, False, None, msg):
                    tell_customer(sb, row, False, msg)
            except Exception as e2:
                print('could not report the failure:', e2, flush=True)
            if not known and row['kind'] == 'pack':
                alert(f'a pack failed ({row["id"][:8]})', f'job {row["id"]} for {row["owner"]}\n\n{trace}')
        else:
            try:
                if finish(sb, row, name, True, result, None):
                    print(f'  done in {time.time() - t0:.0f}s', flush=True)
                    tell_customer(sb, row, True)
                    q = result['manifest'].get('quality') or {}
                    if row['kind'] == 'pack' and q.get('ran') is False:
                        alert(f'a pack went out without its quality check ({row["id"][:8]})',
                              f'job {row["id"]} for {row["owner"]}: {q.get("reason")}.\n'
                              'The customer sees a warning on the pack and in quality-check.txt.')
                else:
                    print('  another worker had taken this job over; this result was not used', flush=True)
            except Exception as e2:
                print('could not report the result:', e2, flush=True)
        if once:
            return 0


if __name__ == '__main__':
    sys.exit(main())
