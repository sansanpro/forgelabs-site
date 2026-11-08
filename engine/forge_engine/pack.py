"""Builds a test pack (videos, stills, captions, ad copy, test plan, zip) or a review preview.

    preview: one review strip per hook, from estimated timings. No voice, no credits, seconds.
    pack:    the voice for each hook, then its video, 9:16 and 4:5 stills and .srt captions,
             plus ad-copy.txt, test-plan.txt, manifest.json and one zip of everything.
"""
import json
import os
import re
import zipfile

from . import render, voice
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


def make_pack(job, out, hooks=None, log=print, workdir=None):
    workdir = workdir or out
    for d in ('videos', 'images', 'captions'):
        os.makedirs(os.path.join(out, d), exist_ok=True)
    S = Screens(job.screens)
    items = []
    try:
        for h in job.hooks:
            if hooks and h['id'] not in hooks: continue
            mp3, words, check = voice_for(job, h, workdir, log)
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
    manifest = {'kind': 'pack', 'name': job.name,
                'ads': [{'id': it['hook']['id'], 'hook': it['hook']['say'], 'files': it['files'],
                         'name_check': it['name_check']} for it in items]}
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
