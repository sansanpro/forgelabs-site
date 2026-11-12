"""Loads and checks a job: everything the engine needs to make one test pack.

A job is JSON (see engine/README.md for the full format):

    brand    name, spoken_name, icon (a screen key), theme
    screens  key -> {path, kind: image | video | card | icon, status_bar}
    hooks    [{id, say, benefit, screen, accent_from, voice?}]  voice: prerecorded audio + words
    opening  {style: hand | phone | rise, motion: page | card, screens, cards}
    body     [{say, head, screen, motion: rise | page | zoom | play | swipe, ...}]
    cta      {say, button, lines, headline}
    voice    {id, model, seed, speed, stability, similarity}
    disclaimer, display, outputs

Paths are relative to the job file. Every hook in a job shares the body and the CTA, so a
test compares only the hooks.
"""
import json
import os
import re

from . import theme as themes

MOTIONS = {'rise', 'page', 'zoom', 'play', 'swipe'}


class JobError(ValueError):
    pass


def clean(text):
    return re.sub(r'\s+', ' ', str(text or '')).strip()


class Job:
    def __init__(self, data, base='.'):
        self.data = data
        self.base = base
        brand = data.get('brand') or {}
        self.name = clean(brand.get('name')) or 'Your app'
        self.spoken_name = clean(brand.get('spoken_name')) or self.name
        self.icon = brand.get('icon')
        self.theme = themes.build(brand.get('theme'))
        self.display = dict(data.get('display') or {})
        self.disclaimer = clean(data.get('disclaimer')) or None

        self.screens = {}
        for key, spec in (data.get('screens') or {}).items():
            spec = dict(spec)
            spec['path'] = os.path.join(base, spec['path'])
            spec.setdefault('kind', 'video' if spec['path'].lower().endswith(('.mp4', '.mov', '.m4v', '.webm')) else 'image')
            spec.setdefault('status_bar', True)
            self.screens[key] = spec

        self.hooks = []
        for h in data.get('hooks') or []:
            h = dict(h)
            h['say'] = clean(h.get('say'))
            if not h.get('id') or not h['say']:
                raise JobError('every hook needs an id and words to say')
            v = h.get('voice')
            if v:
                h['voice'] = {'audio': os.path.join(base, v['audio']), 'words': os.path.join(base, v['words'])}
            self.hooks.append(h)
        if not self.hooks:
            raise JobError('the job has no hooks')

        self.body = []
        prev = None
        for s in data.get('body') or []:
            s = dict(s)
            s['say'] = clean(s.get('say'))
            s.setdefault('motion', 'rise')
            if s['motion'] not in MOTIONS:
                raise JobError(f"unknown motion {s['motion']}")
            if s['motion'] == 'page':
                s.setdefault('from', prev)
                if not s['from']:
                    s['motion'] = 'rise'  # nothing to swipe from on the first scene
            if s['motion'] == 'play' and self.screens.get(s.get('screen'), {}).get('kind') != 'video':
                s['motion'] = 'rise'
            s.setdefault('head', '')
            self.body.append(s)
            prev = s.get('screen') or prev
        if not self.body:
            raise JobError('the job has no body scenes')

        cta = dict(data.get('cta') or {})
        cta['say'] = clean(cta.get('say')) or f'Download {self.spoken_name} free on the App Store.'
        cta.setdefault('button', 'Download free on the App Store')
        cta['lines'] = [clean(l) for l in cta.get('lines') or [] if clean(l)][:2]
        cta.setdefault('headline', f'Download {self.name} free')
        self.cta = cta

        op = dict(data.get('opening') or {'style': 'rise'})
        op.setdefault('style', 'rise')
        if op['style'] in ('hand', 'phone'):
            op.setdefault('motion', 'page')
            if op['motion'] == 'card':
                if len(op.get('screens') or []) < 2 or len(op.get('cards') or []) < 2:
                    raise JobError('a card opening needs two deck screens and two cards')
            else:
                shots = [k for k in op.get('screens') or [] if k in self.screens]
                # Not enough screens chosen: borrow the body's, in order
                for s in self.body:
                    if len(shots) >= 3:
                        break
                    if s.get('screen') in self.screens and self.screens[s['screen']]['kind'] == 'image' and s['screen'] not in shots:
                        shots.append(s['screen'])
                while shots and len(shots) < 3:
                    shots.append(shots[-1])
                if not shots:
                    op['style'] = 'rise'
                op['screens'] = shots
        self.opening = op

        v = dict(data.get('voice') or {})
        v.setdefault('id', 'JBFqnCBsd6RMkjVDRZzb')
        v.setdefault('model', 'eleven_v4')
        v.setdefault('seed', 41)
        v.setdefault('speed', data.get('speed') or (1.15 if op['style'] != 'rise' else 1.0))
        v.setdefault('stability', .5)
        v.setdefault('similarity', .75)
        self.voice = v

        # sfx: whooshes, key clicks and pops under the voice. type: the hook and headings type out
        # letter by letter. camera: push-ins, zooms in and out, zoom-through transitions.
        # true (the default) is all three; false is the original look, which the golden test uses.
        fx = data.get('effects', True)
        fx = {} if fx is True else {'sfx': False, 'type': False, 'camera': False} if fx is False else dict(fx)
        self.effects = {k: bool(fx.get(k, True)) for k in ('sfx', 'type', 'camera')}

        out = dict(data.get('outputs') or {})
        out.setdefault('video', True)
        out.setdefault('stills', ['9x16', '4x5'])
        out.setdefault('srt', True)
        self.outputs = out
        self._check_refs()

    def _check_refs(self):
        refs = [h.get('screen') for h in self.hooks] + [s.get('screen') for s in self.body]
        refs += [s.get('card') for s in self.body if s['motion'] == 'swipe']
        refs += list(self.opening.get('screens') or []) + list(self.opening.get('cards') or [])
        for r in refs:
            if r and r not in self.screens:
                raise JobError(f'screen {r} is used but not provided')
        for s in self.body:
            if not s.get('screen'):
                raise JobError('every body scene needs a screen')

    def hook_screen(self, hook):
        """The screen behind a hook: its own, else the opening's, else the first scene's."""
        for k in (hook.get('screen'), hook.get('still_screen')):
            if k:
                return k
        op = self.opening.get('screens') or []
        if op:
            return op[min(1, len(op) - 1)]
        return next(s['screen'] for s in self.body if self.screens[s['screen']]['kind'] == 'image')

    def still_screen(self, hook):
        k = hook.get('still_screen') or self.hook_screen(hook)
        if self.screens[k]['kind'] == 'image':
            return k
        return next((s['screen'] for s in self.body if self.screens[s['screen']]['kind'] == 'image'), k)

    def script(self, hook):
        return ' '.join([hook['say']] + [s['say'] for s in self.body] + [self.cta['say']])

    def benefit(self, hook):
        return clean(hook.get('benefit') or self.data.get('benefit') or '')


def load(path):
    with open(path) as f:
        data = json.load(f)
    return Job(data, os.path.dirname(os.path.abspath(path)))
