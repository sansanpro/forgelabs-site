"""Builds a test pack (videos, stills, captions, ad copy, test plan, zip) or a review preview.

    preview: one review strip per hook, from estimated timings. No voice, no credits, seconds.
    pack:    the voice for each hook, then its video, 9:16 and 4:5 stills and .srt captions,
             plus ad-copy.txt, test-plan.txt, manifest.json and one zip of everything.

With ANTHROPIC_API_KEY set, direct() lets Claude choose the moves, zooms, headings and sounds
the customer left on auto, and make_pack() has Claude check frames of every ad before encoding,
fixing zooms and headings and retaking voiceovers that miss words (quality-check.txt).
"""
import json
import os
import re
import zipfile

from . import agents, render, voice
from .render import Ad, Screens


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:40] or 'ad'


def srt_time(t):
    ms = int(round(t * 1000))
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'


def srt(ad):
    """Captions for the whole ad, one cue per spoken line, the hook included."""
    cues, words = [], ad.words
    for s in ad.scenes:
        lines = s['lines'] if s['kind'] != 'hook' else [(s['a'], s['b'])]
        for a, b in lines:
            start = words[a]['s']
            end = words[b]['s'] - .05 if b < len(words) else words[-1]['e'] + .4
            text = ' '.join(render.shown(words[i]['w'], ad.display) for i in range(a, b))
            cues.append((start, max(end, start + .3), text))
    return '\n'.join(f'{i}\n{srt_time(s)} --> {srt_time(e)}\n{t}\n' for i, (s, e, t) in enumerate(cues, 1))


def ad_copy(job, items):
    out = [f'{job.name}: ad copy', '=' * (len(job.name) + 10), '',
           'Paste these into your ad platform. Every ad uses the same headline and button, so',
           'the hooks are the only thing your test compares.', '']
    for it in items:
        h = it['hook']
        out += [f"--- {h['id']} ---",
                f"Primary text: {' '.join(x for x in [h['say'], job.benefit(h)] if x)}",
                f"Headline: {job.cta['headline']}",
                f"Button: Download (or Install now / Learn more, whichever your objective offers)",
                f"Video: videos/{it['files']['video']}" if it['files'].get('video') else '',
                *[f"Image {k}: images/{v}" for k, v in it['files'].get('stills', {}).items()],
                '']
    return '\n'.join(l for l in out if l is not None) + '\n'


TEST_PLAN = """How to test this pack
=====================

These ads share one body and one call to action. Only the first line, the hook, changes, so
whichever ad wins tells you which hook works for {name}.

1. Put all {n} videos in ONE ad set (or campaign) with the same audience, budget and
   placements. Use broad targeting and let the platform find the audience.
2. Use the primary text and headline from ad-copy.txt. Upload the 9:16 still as each video's
   cover image if your platform asks for one.
3. Don't edit anything while the test runs. Edits reset the platform's learning.
4. Give each ad about 1,000 impressions before judging. The platform will favour some ads
   early; an ad with almost no impressions hasn't lost, it hasn't been tested.
5. Compare link click-through rate (link clicks / impressions) and cost per link click.
   Then check installs or sign-ups in App Store Connect, Google Play Console or your
   analytics: that's the real goal.
6. Keep the winner. Replace the weakest ads with new hooks in the same category as the
   winner, and run the next round the same way.

Specs: 1080x1920 (9:16) H.264 video with burned-in captions; 4:5 (1080x1350) and 9:16 images.
Text stays inside the 9:16 safe zone, so platform buttons and captions won't cover it.
Before you run: read every ad once with sound on and once with sound off, check every claim
is true today, and check your platform's policies for your app's category.
"""


def voice_for(job, hook, workdir, log=print):
    if hook.get('voice'):
        return voice.load_prerecorded(hook['voice']['audio'], hook['voice']['words'])
    base = os.path.join(workdir, 'vo', slug(hook['id']))
    return voice.make(job.script(hook), job.voice, base, job.spoken_name, job.name, tries=job.voice.get('tries', 1), log=log)


def direct(job, log=print):
    """The director's choices for the body (agents.py), or the job unchanged when Claude isn't
    available or fails. Returns (job, the director's answer or None)."""
    if not agents.available():
        return job, None
    S = Screens(job.screens)
    try:
        log('Directing the scenes')
        return agents.direct(job, S, log=log)
    except Exception as e:
        log(f'the director failed ({type(e).__name__}: {str(e)[:120]}); using the defaults')
        return job, None
    finally:
        S.close()


def check_quality(job, voices, S, workdir, log=print):
    """Claude reviews frames of every ad (agents.review), the fixes are applied, voiceovers that
    miss words are recorded again, and the fixed scenes are checked once more. Returns (job,
    voices, report), with report None when the check didn't run."""
    c = agents.client()
    if not c:
        return job, voices, None
    key = os.environ.get('ELEVENLABS_API_KEY')
    try:
        heard = {hid: voice.transcribe(v[0], key) for hid, v in voices.items()} if key else {}
        ads = [Ad(job, h, voices[h['id']][1], S) for h in job.hooks if h['id'] in voices]
        log('Checking the ads')
        first = agents.review(job, ads, heard, c)
        if not first:
            return job, voices, None
        job, changed = agents.apply_fixes(job, first['fixes'])
        retaken = []
        for h in job.hooks:
            if h['id'] in first['retake'] and h['id'] in voices and not h.get('voice'):
                log(f'Recording {h["id"]} again')
                cfg = dict(job.voice, seed=job.voice['seed'] + 100)
                base = os.path.join(workdir, 'vo', slug(h['id']) + '-retake')
                voices[h['id']] = voice.make(job.script(h), cfg, base, job.spoken_name, job.name, log=log)
                if key:
                    heard[h['id']] = voice.transcribe(voices[h['id']][0], key)
                retaken.append(h['id'])
        recheck = None
        if changed:
            ads = [Ad(job, h, voices[h['id']][1], S) for h in job.hooks if h['id'] in voices]
            recheck = agents.review(job, ads, heard, c, scenes=changed)
        return job, voices, {'summary': first['summary'], 'issues': first['issues'],
                             'fixed_scenes': [i + 1 for i in changed], 'retaken': retaken, 'recheck': recheck}
    except Exception as e:
        log(f'the quality check failed ({type(e).__name__}: {str(e)[:120]}); rendering without it')
        return job, voices, None


def quality_text(q):
    def issues(items):
        return [f"- {i['where']} ({i['check']}): {i['problem']}" for i in items]
    out = ['Quality check', '=============', '',
           'Claude looked at frames from every ad, the script and what was heard in each voiceover.', '',
           q['summary'], '']
    if q['issues']:
        out += ['What it found:', *issues(q['issues']), '']
    if q['fixed_scenes']:
        out.append(f"Fixed before rendering: scene {', '.join(map(str, q['fixed_scenes']))} (zoom or heading).")
    if q['retaken']:
        out.append(f"Voiceover recorded again: {', '.join(q['retaken'])}.")
    if q['recheck']:
        out += ['', 'Checked again after the fixes:', q['recheck']['summary'], *issues(q['recheck']['issues'])]
    out += ['', 'Claims are flagged, never changed: check anything listed under claims before you run the ads.']
    return '\n'.join(out) + '\n'


def make_preview(job, out, hooks=None, log=print):
    """One review strip per hook, from estimated timings."""
    os.makedirs(out, exist_ok=True)
    S = Screens(job.screens)
    files = {}
    try:
        for h in job.hooks:
            if hooks and h['id'] not in hooks: continue
            words = render.estimate_words(job.script(h), job.voice.get('speed', 1.0))
            ad = Ad(job, h, words, S)
            name = f"{slug(h['id'])}-preview.jpg"
            ad.strip().save(os.path.join(out, name), quality=88)
            files[h['id']] = name
            log(f'preview {h["id"]}: {len(ad.scenes)} scenes, about {ad.end:.0f}s')
    finally:
        S.close()
    manifest = {'kind': 'preview', 'strips': files}
    with open(os.path.join(out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    return manifest


def make_pack(job, out, hooks=None, log=print, workdir=None, ai=True):
    """ai: run the quality check (agents.review) when Claude is available."""
    workdir = workdir or out
    for d in ('videos', 'images', 'captions'):
        os.makedirs(os.path.join(out, d), exist_ok=True)
    S = Screens(job.screens)
    items = []
    try:
        voices = {h['id']: voice_for(job, h, workdir, log) for h in job.hooks if not hooks or h['id'] in hooks}
        job, voices, quality = check_quality(job, voices, S, workdir, log) if ai else (job, voices, None)
        for h in job.hooks:
            if h['id'] not in voices: continue
            mp3, words, check = voices[h['id']]
            ad = Ad(job, h, words, S)
            name = slug(h['id'])
            files = {'stills': {}}
            if job.outputs['video']:
                files['video'] = f'{name}.mp4'
                files['duration'] = ad.encode(os.path.join(out, 'videos', files['video']), mp3)
                log(f'video {h["id"]}: {files["duration"]}s')
            for size in job.outputs['stills']:
                fn = f'{name}-{size}.png'
                render.still(job, h, S, size).save(os.path.join(out, 'images', fn))
                files['stills'][size] = fn
            if job.outputs['srt']:
                files['srt'] = f'{name}.srt'
                with open(os.path.join(out, 'captions', files['srt']), 'w') as f:
                    f.write(srt(ad))
            items.append({'hook': h, 'files': files, 'name_check': check})
    finally:
        S.close()
    with open(os.path.join(out, 'ad-copy.txt'), 'w') as f:
        f.write(ad_copy(job, items))
    with open(os.path.join(out, 'test-plan.txt'), 'w') as f:
        f.write(TEST_PLAN.format(name=job.name, n=len(items)))
    if quality:
        with open(os.path.join(out, 'quality-check.txt'), 'w') as f:
            f.write(quality_text(quality))
    manifest = {'kind': 'pack', 'name': job.name,
                'ads': [{'id': it['hook']['id'], 'hook': it['hook']['say'], 'files': it['files'],
                         'name_check': it['name_check']} for it in items]}
    if quality:
        manifest['quality'] = quality
    with open(os.path.join(out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    zname = f'{slug(job.name)}-ad-pack.zip'
    with zipfile.ZipFile(os.path.join(out, zname), 'w', zipfile.ZIP_DEFLATED) as z:
        for root, _, names in os.walk(out):
            for n in names:
                p = os.path.join(root, n)
                rel = os.path.relpath(p, out)
                if rel == zname or rel.startswith('vo' + os.sep) or n.endswith('-name.mp3'): continue
                z.write(p, rel)
    manifest['zip'] = zname
    with open(os.path.join(out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    return manifest
