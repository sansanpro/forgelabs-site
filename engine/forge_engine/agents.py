"""Claude in the render: the director and the quality check.

    direct(job)            looks at each body scene's screenshot and line, and decides what the
                           customer left on auto: the move, the band to zoom into, the heading,
                           and which moments get a sound (a whoosh on a real scene change, a tap
                           on the word where something is tapped). Returns a new Job.
    review(job, ads, ...)  looks at frames of the rendered ads with the script and the brief, and
                           finds text that's cut off or hard to read, zooms that miss what the line
                           talks about, headings that don't match, claims the brief doesn't support
                           and voiceovers that don't say the script. Returns issues and fixes.

Both need ANTHROPIC_API_KEY and the anthropic package; without either, available() is False and
the pack renders as before. FORGE_AI_MODEL overrides the model (default claude-sonnet-5-5).
"""
import base64
import copy
import io
import json
import os
import re

from . import job as jobs

MODEL = os.environ.get('FORGE_AI_MODEL', 'claude-sonnet-5-5')
SOUNDS = ('whoosh', 'tap')


def client():
    key = os.environ.get('ANTHROPIC_API_KEY')
    if not key:
        return None
    try:
        import anthropic
    except ImportError:
        return None
    return anthropic.Anthropic(api_key=key, max_retries=3)


def available():
    return client() is not None


def image(im, side=960):
    """A PIL image as a JPEG content block, at most `side` pixels tall."""
    im = im.convert('RGB')
    if im.height > side:
        im = im.resize((round(im.width * side / im.height), side))
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=82)
    return {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg',
                                        'data': base64.b64encode(buf.getvalue()).decode()}}


def ask(c, system, content, schema, effort='medium'):
    """One structured reply, or None if the model declined."""
    r = c.beta.messages.create(
        model=MODEL, max_tokens=16000,
        betas=['server-side-fallback-2026-07-01'], fallbacks='default',
        thinking={'type': 'adaptive'},
        output_config={'effort': effort, 'format': {'type': 'json_schema', 'schema': schema}},
        system=system, messages=[{'role': 'user', 'content': content}])
    if r.stop_reason == 'refusal':
        return None
    text = next((b.text for b in r.content if b.type == 'text'), None)
    if text is None:
        raise RuntimeError(f'no text in the reply (stop reason {r.stop_reason})')
    return json.loads(text)


def brief_text(job):
    b = job.data.get('brief') or {}
    lines = [f'App name: {job.name}', f"What it does: {b.get('one_liner') or 'not given'}"]
    if b.get('comparison'):
        lines.append(f"A familiar comparison: {b['comparison']}")
    if b.get('category'):
        lines.append(f"Category, for ad policy: {b['category']}")
    return '\n'.join(lines)


def numbered(say):
    return ' '.join(f'[{i}]{w}' for i, w in enumerate(say.split()))


# ---------- the director ----------

DIRECTOR = """You direct short vertical video ads for apps. The ad is a phone showing the app's real
screens while a voice reads the script; each body scene shows one screen while its line is spoken.
You decide, scene by scene, what the customer left to you. The goal is an ad that feels deliberate
and premium: every move and sound has a reason that the viewer can see or hear.

Moves (only where the scene says "auto"):
- "rise": the phone slides up. Good for the first body scene, or a screen that should be seen whole.
- "page": a swipe across from the previous scene's screen. Only when the previous scene shows a
  different screen; it reads as moving through the app.
- "zoom": enlarges a band of the screen so small text is readable. Use it when the line talks about
  one specific part of the screen (a number, a chart, a button) rather than the whole screen.
  Give the band as [top, bottom], fractions of the screenshot's height from 0 (top) to 1 (bottom):
  the band must contain the thing the line talks about, at least 0.15 and at most 0.6 tall.
Screen recordings always play; their move is fixed.

Headings (only where the scene's heading is empty): at most 28 characters of text at the top of the
screen that sharpen what the line says, in the line's own terms. Never add a claim, number or
feature the line and brief don't state. Leave it empty if the screen already says it clearly.

Sounds, kept rare so each one lands (about three in a whole ad):
- whoosh: true only where something visibly moves: a "page" swipe, or a cut to a different screen.
  Never on two scenes in a row unless both are swipes.
- tap_word: the index of the word where the line describes tapping, ticking or pressing something
  on screen (the [n] before each word), or -1. Most scenes have none.
No other sounds: the end card has its own."""

DIRECTOR_SCHEMA = {
    'type': 'object',
    'properties': {
        'scenes': {'type': 'array', 'items': {
            'type': 'object',
            'properties': {
                'scene': {'type': 'integer'},
                'motion': {'type': 'string', 'enum': ['keep', 'rise', 'page', 'zoom']},
                'zoom_top': {'type': 'number'},
                'zoom_bottom': {'type': 'number'},
                'head': {'type': 'string'},
                'whoosh': {'type': 'boolean'},
                'tap_word': {'type': 'integer'},
                'why': {'type': 'string'},
            },
            'required': ['scene', 'motion', 'zoom_top', 'zoom_bottom', 'head', 'whoosh', 'tap_word', 'why'],
            'additionalProperties': False,
        }},
    },
    'required': ['scenes'],
    'additionalProperties': False,
}


def direction_prompt(job, S):
    content = [{'type': 'text', 'text': f'{brief_text(job)}\n\nHooks (each ad opens with one, then the same body):\n' +
                '\n'.join(f"- {h['say']}" for h in job.hooks)}]
    prev = None
    for i, s in enumerate(job.body):
        kind = job.screens[s['screen']]['kind']
        auto = s.get('auto') and kind != 'video'
        head = s.get('head') or ''
        content.append({'type': 'text', 'text': (
            f"\nScene {i + 1}: says {numbered(s['say'])}\n"
            f"Move: {'auto' if auto else s['motion'] + ' (fixed)'}"
            f"{'; the previous scene shows the same screen' if prev == s['screen'] else ''}\n"
            f"Heading: {repr(head) + ' (fixed)' if head else 'empty'}\n"
            f"Screen ({'a screen recording, first frame' if kind == 'video' else 'screenshot'}):")})
        content.append(image(S.phone(s['screen'])))
        prev = s['screen']
    content.append({'type': 'text', 'text': '\nDecide every scene, in order. For a fixed move answer "keep"; '
                    'zoom_top and zoom_bottom are ignored unless the move is zoom.'})
    return content


def apply_direction(job, answer):
    """A new Job with the director's choices, each checked against what the scene allows."""
    data = copy.deepcopy(job.data)
    by = {a['scene'] - 1: a for a in answer.get('scenes', []) if isinstance(a.get('scene'), int)}
    prev = None
    for i, s in enumerate(data['body']):
        a = by.get(i)
        if not a:
            prev = s['screen']
            continue
        kind = job.screens[s['screen']]['kind']
        if s.get('auto') and kind != 'video' and a['motion'] in ('rise', 'page', 'zoom'):
            m = a['motion']
            if m == 'page' and (prev is None or prev == s['screen']):
                m = 'rise'
            top, bottom = sorted((max(0.0, min(1.0, a['zoom_top'])), max(0.0, min(1.0, a['zoom_bottom']))))
            if m == 'zoom' and not .12 <= bottom - top <= .7:
                m = 'rise'
            s['motion'] = m
            s.pop('zoom', None)
            if m == 'zoom':
                s['zoom'] = [round(top, 3), round(bottom, 3)]
        if not s.get('head'):
            s['head'] = jobs.clean(a['head'])[:28]
        sfx = [{'sound': 'whoosh'}] if a['whoosh'] else []
        n = len(s['say'].split())
        if 0 <= a['tap_word'] < n:
            sfx.append({'sound': 'tap', 'word': a['tap_word']})
        s['sfx'] = sfx
        prev = s['screen']
    return jobs.Job(data, job.base)


def direct(job, S, c=None, log=print):
    """(new Job, the director's answer), or (job, None) when it can't run."""
    c = c or client()
    if not c:
        return job, None
    answer = ask(c, DIRECTOR, direction_prompt(job, S), DIRECTOR_SCHEMA, 'medium')
    if not answer:
        log('the director declined; using the defaults')
        return job, None
    return apply_direction(job, answer), answer


# ---------- the quality check ----------

REVIEWER = """You check short vertical video ads for apps before the customer sees them. You get
frames from the rendered ads (1080x1920, shown smaller), the script, the brief, and what a
speech-to-text model heard in each voiceover. Find real problems a viewer would notice, not taste.

Check:
- readable: text cut off, overlapping, too small, or low contrast; captions or headings covered.
- zoom: a zoom scene's band must show what its line talks about. If it misses, give a better band
  as fractions of the screenshot's height (0 top, 1 bottom), 0.15 to 0.6 tall.
- heading: on-screen headings must match their line and add no claim.
- claims: anything said or shown that the brief doesn't support (invented numbers, results,
  features, implied access to the viewer's data). You can't fix these; flag them.
- voice: the heard text may spell an invented app name as a real word; that's fine. Flag missing,
  repeated or wrong words in the rest of the script, and ask for a retake of that hook.

Only fix what you flagged. A fix for a scene replaces its zoom band and/or heading; use -1 for a
band you're not changing and "keep" for a heading you're not changing ("" removes it)."""

REVIEW_SCHEMA = {
    'type': 'object',
    'properties': {
        'issues': {'type': 'array', 'items': {
            'type': 'object',
            'properties': {
                'where': {'type': 'string'},
                'check': {'type': 'string', 'enum': ['readable', 'zoom', 'heading', 'claims', 'voice']},
                'problem': {'type': 'string'},
            },
            'required': ['where', 'check', 'problem'], 'additionalProperties': False,
        }},
        'fixes': {'type': 'array', 'items': {
            'type': 'object',
            'properties': {
                'scene': {'type': 'integer'},
                'zoom_top': {'type': 'number'},
                'zoom_bottom': {'type': 'number'},
                'head': {'type': 'string'},
            },
            'required': ['scene', 'zoom_top', 'zoom_bottom', 'head'], 'additionalProperties': False,
        }},
        'retake': {'type': 'array', 'items': {'type': 'string'}},
        'summary': {'type': 'string'},
    },
    'required': ['issues', 'fixes', 'retake', 'summary'],
    'additionalProperties': False,
}


def words_differ(script, heard):
    """The script's words that the transcript doesn't have, in order, ignoring case and punctuation."""
    norm = lambda s: [re.sub(r'[^a-z0-9]', '', w.lower()) for w in s.split()]
    have = norm(heard)
    return [w for w in norm(script) if w and w not in have]


def review_prompt(job, ads, heard, scenes=None):
    """Frames of every hook, and of the shared body and end card from the first ad. `scenes`
    limits the body frames to those scene indexes (a re-check after fixes)."""
    content = [{'type': 'text', 'text': brief_text(job)}]
    first = ads[0]
    if scenes is None:
        for ad in ads:
            h = ad.hook
            s = ad.scenes[0]
            miss = words_differ(job.script(h), heard.get(h['id'], '')) if h['id'] in heard else None
            content.append({'type': 'text', 'text': (
                f"\nHook {h['id']}: {h['say']}\n"
                + (f"Heard in this ad's voiceover: {heard[h['id']]!r}\n" if h['id'] in heard else '')
                + (f"Script words not heard: {', '.join(miss) or 'none'}\n" if miss is not None else '')
                + 'Frame as the hook finishes:')})
            content.append(image(ad.frame(s['t1'] - .12)))
    body = [s for s in first.scenes if s['kind'] == 'body']
    for i, s in enumerate(body):
        if scenes is not None and i not in scenes:
            continue
        zoom = f", zoom band {s['zoom'][0]:.2f}-{s['zoom'][1]:.2f}" if s['motion'] == 'zoom' and s.get('zoom') else ''
        content.append({'type': 'text', 'text': (
            f"\nScene {i + 1}: says {s['say']!r}; heading {s.get('head') or '(none)'!r}; move {s['motion']}{zoom}")})
        settled = min(s['t1'] - .1, s['t0'] + max(1.2, (s['t1'] - s['t0']) * .8))
        content.append(image(first.frame(settled)))
        if s['motion'] == 'zoom':
            content.append({'type': 'text', 'text': 'The whole screenshot, for placing the band:'})
            content.append(image(first.S.phone(s['screen'])))
    if scenes is None:
        end = first.scenes[-1]
        content.append({'type': 'text', 'text': f"\nEnd card: says {end['say']!r}"})
        content.append(image(first.frame(min(first.end - .1, end['t0'] + 1.4))))
    content.append({'type': 'text', 'text': '\nReport what you find. Scene numbers count the body scenes from 1.'})
    return content


def apply_fixes(job, fixes):
    data = copy.deepcopy(job.data)
    changed = []
    for f in fixes:
        i = f.get('scene')
        i = i - 1 if isinstance(i, int) else None
        if i is None or not 0 <= i < len(data['body']):
            continue
        s = data['body'][i]
        if s.get('motion') == 'zoom' and f['zoom_top'] >= 0 and f['zoom_bottom'] >= 0:
            top, bottom = sorted((min(1.0, f['zoom_top']), min(1.0, f['zoom_bottom'])))
            if .12 <= bottom - top <= .7:
                s['zoom'] = [round(top, 3), round(bottom, 3)]
                changed.append(i)
        if f['head'] != 'keep':
            s['head'] = jobs.clean(f['head'])[:28]
            changed.append(i)
    return jobs.Job(data, job.base), sorted(set(changed))


def review(job, ads, heard, c=None, scenes=None):
    c = c or client()
    if not c:
        return None
    return ask(c, REVIEWER, review_prompt(job, ads, heard, scenes), REVIEW_SCHEMA, 'high')
