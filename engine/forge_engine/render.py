"""Draws the frames of a 9:16 ad, and encodes videos, review strips and stills.

Generalized from the StockMatcherAI renderer (docs/HOW-THE-ADS-ARE-MADE.md, section 6). The
theme, screens, scenes and copy come from the job instead of hard-coded files; the layout,
timing, captions and the hand-held cold open are the same.

Text stays inside the 9:16 safe zone (top 14%, bottom 35%, sides 6%); only the phone runs
below it.
"""
import math
import os
import re
import subprocess

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(os.path.dirname(HERE), 'assets')
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

W, H, FPS = 1080, 1920, 30
SAFE_T, SAFE_B, SAFE_X = 269, 1248, 66


# ---------- text ----------
fonts = {}
def F(size, weight=700):
    k = (size, weight)
    if k not in fonts:
        f = ImageFont.truetype(os.path.join(ASSETS, 'fonts', 'Inter.ttf'), size)
        f.set_variation_by_axes([min(32, max(14, size)), weight])
        fonts[k] = f
    return fonts[k]

sprites = {}
def sprite(text, size, color, weight=700):
    k = (text, size, color, weight)
    if k not in sprites:
        f = F(size, weight)
        asc, desc = f.getmetrics()
        im = Image.new('RGBA', (int(f.getlength(text)) + 8, asc + desc + 6), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((0, 0), text, font=f, fill=color + (255,))
        sprites[k] = im
    return sprites[k]

def fit_size(text, size, width, weight=700, floor=30):
    """The largest size up to `size` at which one line of text fits the width."""
    while size > floor and F(size, weight).getlength(text) > width:
        size -= 4
    return size

def clamp(x): return max(0.0, min(1.0, x))
def ease(x): return 1 - (1 - clamp(x)) ** 3
def smooth(x):
    v = clamp(x)
    return v * v * (3 - 2 * v)

def put(fr, im, x, y, o=1.0):
    if o <= 0: return
    if o < 1:
        im = im.copy()
        im.putalpha(im.getchannel('A').point(lambda v: int(v * o)))
    fr.paste(im, (int(x), int(y)), im)

DOTTED = re.compile(r'^((?:[A-Za-z]\.){2,})([,!?;:]*)$')

def shown(word, display):
    """How a spoken word is written on screen: the job's own spellings first, then letters
    spelled with dots for the voice ("A.I.") written without them ("AI")."""
    if word in display: return display[word]
    m = DOTTED.match(word)
    if m: return m.group(1).replace('.', '') + m.group(2)
    return word

def wrap(words, size, width, weight=700, display=None):
    display = display or {}
    f = F(size, weight); lines = [[]]; cur = 0
    sp = f.getlength(' ')
    for w in words:
        l = f.getlength(shown(w, display))
        if lines[-1] and cur + sp + l > width:
            lines.append([]); cur = 0
        cur += (sp if lines[-1] else 0) + l
        lines[-1].append(w)
    return lines


# ---------- screens ----------
SHOT_W, SHOT_H = 1179, 2556   # a capture at iPhone size: 393x852 points at 3x
BAND = 165                    # the status bar drawn above a capture that has none
SCREEN_W, SCREEN_H = SHOT_W, SHOT_H + BAND
BEZEL = 34
PHONE_W = SCREEN_W + 2 * BEZEL
PHONE_H = SCREEN_H + 2 * BEZEL
CARD_TOP = 243  # where the swipe card starts in a deck capture (StockMatcherAI's layout)

def rounded_mask(size, r):
    m = Image.new('L', (size[0] * 2, size[1] * 2), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, m.width - 1, m.height - 1), r * 2, fill=255)
    return m.resize(size, Image.LANCZOS)

def cover(im, w, h):
    """Scales im to fill w x h, keeping the top (where the status bar is) and the centre."""
    s = max(w / im.width, h / im.height)
    if abs(s - 1) > 1e-3 or im.size != (w, h):
        im = im.resize((max(w, round(im.width * s)), max(h, round(im.height * s))), Image.LANCZOS)
    x = (im.width - w) // 2
    return im.crop((x, 0, x + w, h))

def with_band(shot):
    """A capture with no status bar of its own gets one drawn above it."""
    top = shot.getpixel((SHOT_W // 2, 4))
    dark = sum(top) < 380
    ink = (255, 255, 255) if dark else (24, 14, 18)
    screen = Image.new('RGB', (SCREEN_W, SCREEN_H), top)
    screen.paste(shot, (0, BAND))
    d = ImageDraw.Draw(screen)
    d.text((120, 66), '9:41', font=F(50, 600), fill=ink)
    for i, h in enumerate((18, 26, 34, 42)):
        d.rounded_rectangle((SHOT_W - 250 + i * 18, 106 - h, SHOT_W - 238 + i * 18, 106), 3, fill=ink)
    d.rounded_rectangle((SHOT_W - 150, 72, SHOT_W - 76, 108), 10, fill=ink)
    return screen


class Recording:
    """A screen recording, played at FPS and fitted to w x h. Reads forward and starts again
    if asked for an earlier moment; after the last frame it holds that frame."""
    def __init__(self, path, w, h):
        self.path, self.w, self.h = path, w, h
        self.proc, self.i, self.last = None, -1, None

    def _start(self):
        self.close()
        w, h = self.w, self.h
        vf = f'fps={FPS},scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}:(iw-{w})/2:0'
        self.proc = subprocess.Popen([FFMPEG, '-v', 'error', '-i', self.path, '-vf', vf, '-f', 'rawvideo',
                                      '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
        self.i = -1

    def frame(self, t):
        want = max(0, int(t * FPS))
        if self.proc is None or want < self.i:
            self._start()
        n = self.w * self.h * 3
        while self.i < want:
            buf = self.proc.stdout.read(n)
            if len(buf) < n:
                self.i = want  # ended: hold the last frame
                break
            self.last = Image.frombytes('RGB', (self.w, self.h), buf)
            self.i += 1
        return self.last or Image.new('RGB', (self.w, self.h), (0, 0, 0))

    def close(self):
        if self.proc:
            self.proc.kill(); self.proc.wait(); self.proc = None


class Screens:
    """The job's screens, prepared once for the drawn phone and for the hand photo.

    A screenshot taken on a phone has its own status bar, so it fills the screen. A capture
    with none (a browser at phone size, as StockMatcherAI's were) gets a drawn status bar on
    the phone and sits below the photo's notch in the hand."""
    def __init__(self, specs):
        self.specs = specs
        self.cache = {}
        self.readers = {}

    def spec(self, key):
        if key not in self.specs: raise KeyError(f'unknown screen {key}')
        return self.specs[key]

    def _open(self, key):
        k = ('open', key)
        if k not in self.cache:
            self.cache[k] = Image.open(self.spec(key)['path']).convert('RGB')
        return self.cache[k]

    def raw(self, key):
        """A capture without a status bar, at SHOT_W x SHOT_H."""
        k = ('raw', key)
        if k not in self.cache:
            im = self._open(key)
            if im.width != SHOT_W:
                im = im.resize((SHOT_W, round(im.height * SHOT_W / im.width)), Image.LANCZOS)
            if im.height != SHOT_H:
                canvas = Image.new('RGB', (SHOT_W, SHOT_H), im.getpixel((SHOT_W // 2, im.height - 2)))
                canvas.paste(im.crop((0, 0, SHOT_W, min(SHOT_H, im.height))), (0, 0))
                im = canvas
            self.cache[k] = im
        return self.cache[k]

    def card(self, key):
        k = ('card', key)
        if k not in self.cache:
            im = Image.open(self.spec(key)['path']).convert('RGBA')
            im.putalpha(rounded_mask(im.size, 66))
            self.cache[k] = im
        return self.cache[k]

    def recording(self, key, owner):
        k = (key, owner)
        if k not in self.readers:
            self.readers[k] = Recording(self.spec(key)['path'], SCREEN_W, SCREEN_H)
        return self.readers[k]

    def still_frame(self, key):
        """A screen as a still: the image, or a recording's first frame."""
        if self.spec(key).get('kind') == 'video':
            k = ('first', key)
            if k not in self.cache:
                r = Recording(self.spec(key)['path'], SCREEN_W, SCREEN_H)
                self.cache[k] = r.frame(.5); r.close()
            return self.cache[k]
        return None

    def phone(self, key, frame=None):
        """The screen at SCREEN_W x SCREEN_H, without the island (the phone draws that)."""
        if frame is None:
            frame = self.still_frame(key)
            k = ('phone', key)
            if k in self.cache: return self.cache[k]
        else:
            k = None
        spec = self.spec(key)
        if spec.get('status_bar', True) or spec.get('kind') == 'video':
            im = cover(frame if frame is not None else self._open(key), SCREEN_W, SCREEN_H)
        else:
            im = with_band(frame if frame is not None else self.raw(key))
        if k: self.cache[k] = im
        return im

    def hand(self, key, w, h, frame=None):
        """The screen for the hand photo's w x h screen box."""
        if frame is None:
            frame = self.still_frame(key)
            k = ('hand', key, w, h)
            if k in self.cache: return self.cache[k]
        else:
            k = None
        spec = self.spec(key)
        if spec.get('status_bar', True) or spec.get('kind') == 'video':
            im = cover(frame if frame is not None else self._open(key), w, h)
        else:
            shot = frame if frame is not None else self.raw(key)
            sized = shot.resize((w, int(SHOT_H * w / SHOT_W)), Image.BILINEAR)
            im = Image.new('RGB', (w, h), shot.getpixel((SHOT_W // 2, 4)))
            im.paste(sized, (0, HAND_NOTCH))
        if k: self.cache[k] = im
        return im

    def icon(self, key, size):
        if not key or key not in self.specs: return None
        k = ('icon', key, size)
        if k not in self.cache:
            im = cover(self._open(key), size, size).convert('RGBA')
            im.putalpha(rounded_mask(im.size, int(size * .225)))
            self.cache[k] = im
        return self.cache[k]

    def close(self):
        for r in self.readers.values(): r.close()


# A view is what the phone shows at one moment:
#   ('static', key)                     a screen
#   ('card', base, card, dx, rot)       a card flying off a deck screen (dx: share of the width)
#   ('page', a, b, q)                   swiping from screen a to screen b, q from 0 to 1
#   ('video', key, t, owner)            a recording, t seconds in

def phone_view(S, view):
    kind = view[0]
    if kind == 'static':
        return S.phone(view[1])
    if kind == 'card':
        _, base, card, dx, rot = view
        im = S.phone(base).copy()
        c = S.card(card)
        r = c.rotate(-rot, resample=Image.BILINEAR, expand=True)
        im.paste(r, ((SHOT_W - r.width) // 2 + int(dx * SHOT_W), BAND + CARD_TOP - (r.height - c.height) // 2), r)
        return im
    if kind == 'page':
        _, a, b, q = view
        if q <= 0: return S.phone(a)
        if q >= 1: return S.phone(b)
        off = int(q * SCREEN_W)
        im = Image.new('RGB', (SCREEN_W, SCREEN_H))
        im.paste(S.phone(a), (-off, 0))
        im.paste(S.phone(b), (SCREEN_W - off, 0))
        return im
    _, key, t, owner = view
    return S.phone(key, frame=S.recording(key, owner).frame(t))

SCREEN_MASK = None

def make_shell(screen):
    """The phone: a black body, the screen with rounded corners, and the island."""
    global SCREEN_MASK
    if SCREEN_MASK is None: SCREEN_MASK = rounded_mask((SCREEN_W, SCREEN_H), 136)
    im = Image.new('RGBA', (PHONE_W, PHONE_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, PHONE_W - 1, PHONE_H - 1), 170, fill=(10, 6, 8, 255), outline=(84, 70, 76, 255), width=5)
    scr = screen.convert('RGBA')
    scr.putalpha(SCREEN_MASK)
    im.alpha_composite(scr, (BEZEL, BEZEL))
    d.rounded_rectangle((BEZEL + SHOT_W // 2 - 190, BEZEL + 36, BEZEL + SHOT_W // 2 + 190, BEZEL + 140), 52, fill=(0, 0, 0, 255))
    return im

def shell(S, view):
    if view[0] != 'static':
        return make_shell(phone_view(S, view))
    k = ('shell', view[1])
    if k not in S.cache:
        S.cache[k] = make_shell(phone_view(S, view))
    return S.cache[k]

def draw_phone(fr, S, view, top, width, crop=None, room=0):
    """Draws the phone at `top`. crop = (y0, y1) as shares of the phone: zooms that band of
    the screen to the full width, centred in `room`."""
    src = shell(S, view)
    scale = width / PHONE_W
    if crop:
        y0, y1 = int(crop[0] * PHONE_H), int(crop[1] * PHONE_H)
        band = src.crop((BEZEL, y0, PHONE_W - BEZEL, y1))
        scale = width / band.width
        im = band.resize((width, int(band.height * scale)), Image.BILINEAR)
        im.putalpha(rounded_mask(im.size, 36))
        fr.paste(im, ((W - width) // 2, int(top + max(0, (room - im.height) / 2))), im)
        return
    visible = min(PHONE_H, int((H - top) / scale) + 2)
    band = src.crop((0, 0, PHONE_W, visible))
    im = band.resize((width, int(visible * scale)), Image.BILINEAR)
    fr.paste(im, ((W - width) // 2, int(top)), im)


# ---------- a hand holding the phone (tools/make_hand_asset.py) ----------
HAND_SCREEN = (216, 190, 700, 1255)  # the screen's box in hand-phone.png
HAND_NOTCH = 40    # keeps a capture's content below the photo's notch
HAND_TOP = 160     # the top of the phone in hand-phone.png
HAND_PIVOT = (560, 1500)  # the wrist end, so the phone turns the way a hand would

def hand_view(S, view, w, h):
    kind = view[0]
    if kind == 'static':
        return S.hand(view[1], w, h)
    if kind == 'card':
        _, base, card, dx, rot = view
        shot = S.raw(base).copy()
        c = S.card(card)
        r = c.rotate(-rot, resample=Image.BILINEAR, expand=True)
        shot.paste(r, ((SHOT_W - r.width) // 2 + int(dx * SHOT_W), CARD_TOP - (r.height - c.height) // 2), r)
        return S.hand(base, w, h, frame=shot)
    if kind == 'page':
        _, a, b, q = view
        if q <= 0: return S.hand(a, w, h)
        if q >= 1: return S.hand(b, w, h)
        off = int(q * w)
        im = Image.new('RGB', (w, h))
        im.paste(S.hand(a, w, h), (-off, 0))
        im.paste(S.hand(b, w, h), (w - off, 0))
        return im
    _, key, t, owner = view
    return S.hand(key, w, h, frame=S.recording(key, owner).frame(t))

def hand_comp(S, view):
    """The hand photo with the screen behind the thumb."""
    k = ('handcomp', view[1]) if view[0] == 'static' else None
    if k and k in S.cache: return S.cache[k]
    hand = S.cache.get('hand-phone')
    if hand is None:
        hand = S.cache['hand-phone'] = Image.open(os.path.join(ASSETS, 'hand-phone.png')).convert('RGBA')
    x0, y0, x1, y1 = HAND_SCREEN
    w, h = x1 - x0 + 16, y1 - y0 + 16
    im = Image.new('RGBA', hand.size, (0, 0, 0, 0))
    im.paste(hand_view(S, view, w, h), (x0 - 8, y0 - 8))
    im.alpha_composite(hand)
    if k: S.cache[k] = im
    return im

def draw_hand(fr, S, view, top, scale=1.0, dx=0, rot=0):
    """Draws it with the phone's top edge at `top`."""
    im = hand_comp(S, view)
    if rot: im = im.rotate(-rot, resample=Image.BILINEAR, center=HAND_PIVOT)
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.BILINEAR)
    fr.paste(im, (int((W - im.width) / 2 + dx), int(top - HAND_TOP * scale)), im)


# ---------- an ad ----------
def background(theme):
    bg = Image.new('RGB', (W, H), theme['bg'])
    g = Image.new('L', (W, H), 0)
    ImageDraw.Draw(g).ellipse((-260, -760, W + 260, 760), fill=255)
    bg.paste(Image.new('RGB', (W, H), theme['glow']), (0, 0), g.filter(ImageFilter.GaussianBlur(190)))
    return bg

def estimate_words(text, speed=1.0):
    """Word timings for a review strip, before any voice exists."""
    t, out = .1, []
    for w in text.split():
        d = (.16 + .052 * len(w)) / speed
        out.append({'w': w, 's': round(t, 3), 'e': round(t + d, 3)})
        t += d + .03 / speed
        if w[-1] in '.?!': t += .32 / speed
        elif w[-1] in ',;:': t += .16 / speed
    return out


class Ad:
    def __init__(self, job, hook, words, S):
        self.job, self.hook, self.S = job, hook, S
        self.theme = job.theme
        self.display = job.display
        self.bg = background(self.theme)
        self.words = words
        self.end = words[-1]['e'] + 2.2
        scenes = [dict(kind='hook', say=hook['say'], screen=job.hook_screen(hook))]
        scenes += [dict(s, kind='body') for s in job.body]
        scenes.append(dict(kind='outro', say=job.cta['say']))
        i = 0
        for s in scenes:
            n = len(s['say'].split())
            s['a'], s['b'] = i, i + n
            i += n
        if i != len(words):
            raise ValueError(f'the voice has {len(words)} words but the script has {i}')
        for j, s in enumerate(scenes):
            s['t0'] = 0 if j == 0 else words[s['a']]['s']
        for j, s in enumerate(scenes):
            s['t1'] = scenes[j + 1]['t0'] if j + 1 < len(scenes) else self.end + 1
            s['lines'] = self.caption_lines(s)
        self.scenes = scenes
        self.opening = job.opening
        self.hand = self.opening['style'] == 'hand'

    def caption_lines(self, s):
        """The scene's words grouped into caption lines, as (first, end) word indexes."""
        if s['kind'] == 'hook': return []
        f = F(48, 700)
        lines = []; cur = s['a']; width = 0
        for i in range(s['a'], s['b']):
            w = shown(self.words[i]['w'], self.display)
            width += f.getlength(w + ' ')
            nxt = shown(self.words[i + 1]['w'], self.display) if i + 1 < s['b'] else ''
            if i == s['b'] - 1 or w[-1] in '.,?' or width + f.getlength(nxt) > 860:
                lines.append((cur, i + 1)); cur = i + 1; width = 0
        # Never leave one word alone on a line: the line before gives it a companion
        for k in range(1, len(lines)):
            (a, b), (c, d) = lines[k - 1], lines[k]
            if d - c == 1 and b - a >= 3 and shown(self.words[b - 1]['w'], self.display)[-1] not in '.,?':
                lines[k - 1], lines[k] = (a, b - 1), (b - 1, d)
        return lines

    def caption(self, fr, t, s):
        # Word-timed, in the safe zone, over the phone
        size = 48; f = F(size, 700)
        for a, b in s['lines']:
            end = self.words[b]['s'] if b < len(self.words) else 1e9
            if self.words[a]['s'] - .05 <= t < end:
                words = [shown(self.words[i]['w'], self.display) for i in range(a, b)]
                total = f.getlength(' '.join(words))
                x = (W - total) / 2; y = SAFE_B - 92
                pill = Image.new('RGBA', (int(total + 72), 88), (0, 0, 0, 0))
                ImageDraw.Draw(pill).rounded_rectangle((0, 0, pill.width - 1, 87), 34, fill=(20, 10, 16, 240))
                put(fr, pill, x - 36, y - 13)
                for i, w in zip(range(a, b), words):
                    on = self.words[i]['s'] - .03 <= t < (self.words[i + 1]['s'] if i + 1 < len(self.words) else 1e9)
                    put(fr, sprite(w, size, self.theme['highlight'] if on else (255, 255, 255)), x, y)
                    x += f.getlength(w + ' ')
                return

    def cold_open(self, fr, s, t, top):
        """Already moving on frame one: two swipes while the hook is spoken, the first under way
        at t=0. Card swipes use cutouts (StockMatcherAI); page swipes work with any screens."""
        op = self.opening
        sway = math.sin(t * 2.3) * .5
        q1, q2 = smooth((t + .15) / .5), smooth((t - 1.0) / .45)
        second = q1 >= 1 and t >= 1.0
        if op['motion'] == 'card':
            (b, c), (c1, c2) = op['screens'][:2], op['cards'][:2]
            view = ('card', c, c2, 1.25 * q2, 16 * q2) if second else ('card', b, c1, 1.25 * q1, 16 * q1)
            if q2 >= 1: view = ('static', c)
        else:
            a, b, c = op['screens'][:3]
            view = ('page', b, c, q2) if second else ('page', a, b, q1)
        nudge = q1 * (1 - q1) + q2 * (1 - q2)  # the hand moves with each swipe
        if self.hand:
            draw_hand(fr, self.S, view, top, .95, dx=nudge * 40 + sway * 5, rot=nudge * 5 + sway)
        else:
            draw_phone(fr, self.S, view, top, 640)

    def hook_frame(self, fr, s, t):
        th = self.theme
        words = s['say'].split()
        size = 96
        lines = wrap(words, size, W - 2 * SAFE_X, display=self.display)
        while len(lines) > 3:
            size -= 6; lines = wrap(words, size, W - 2 * SAFE_X, display=self.display)
        lh = int(size * 1.14)
        ptop = SAFE_T + len(lines) * lh + 46
        if self.opening['style'] in ('hand', 'phone'):
            self.cold_open(fr, s, t, ptop)
        else:
            p = ease((t - .02) / .5)
            draw_phone(fr, self.S, self.view(s, t), ptop + (1 - p) * 120, 640)
        y = SAFE_T; i = s['a']; f = F(size)
        n_q = self.hook.get('accent_from', next((n for n, w in enumerate(words) if w[-1] in '.?'), len(words) - 1) + 1) - 1
        for line in lines:
            x = SAFE_X
            for w in line:
                st = self.words[i]['s']
                q = ease((t - st + .06) / .24)
                col = th['accent'] if (i - s['a']) > n_q else th['text']
                word = shown(w, self.display)
                if q > 0: put(fr, sprite(word, size, col), x, y + (1 - q) * 26, min(1, q * 1.4))
                x += f.getlength(word + ' '); i += 1
            y += lh

    def view(self, s, t):
        key = s['screen']
        if self.S.spec(key).get('kind') == 'video':
            return ('video', key, max(0, t - s['t0']), id(s))
        return ('static', key)

    def body_frame(self, fr, s, t):
        th = self.theme; t0 = s['t0']
        p = ease((t - t0) / .35)
        head = s.get('head') or ''
        if head:
            size = fit_size(head, 74 if len(head) < 27 else 62, W - 2 * SAFE_X)
            put(fr, sprite(head, size, th['text']), SAFE_X, SAFE_T + (1 - p) * 20, p)
        motion = s['motion']
        top = SAFE_T + 118
        if motion in ('swipe', 'page'):
            if motion == 'swipe':
                sign = 1 if s.get('dir', 'right') == 'right' else -1
                q = smooth((t - t0 - .15) / .7)
                view = ('card', s['screen'], s['card'], sign * 1.25 * q, sign * 16 * q)
            else:
                sign = 1
                q = smooth((t - t0 - .15) / .6)
                view = ('page', s['from'], s['screen'], q)
            if self.hand:
                draw_hand(fr, self.S, view, top, 1.15, dx=sign * q * (1 - q) * 40, rot=sign * q * (1 - q) * 5)
            else:
                draw_phone(fr, self.S, view, top, 680)
        elif motion == 'zoom':
            z = s.get('zoom') or [0, .3, 1, .7]
            a, b = (z[1], z[3]) if len(z) == 4 else (z[0], z[1])
            q = smooth((t - t0 - .05) / .5)
            top = SAFE_T + 110
            w = int(s.get('zoom_w', 948) * (.86 + .14 * q))
            draw_phone(fr, self.S, ('static', s['screen']) if self.S.spec(s['screen']).get('kind') != 'video'
                       else self.view(s, t), top, w, crop=(a, b), room=SAFE_B - 110 - top)
        else:
            p2 = ease((t - t0) / .45)
            if self.hand:
                draw_hand(fr, self.S, self.view(s, t), top + (1 - p2) * 90, 1.15, rot=math.sin(t * 2.3) * .5)
            else:
                draw_phone(fr, self.S, self.view(s, t), top + (1 - p2) * 90, 680)
        self.caption(fr, t, s)

    def outro_frame(self, fr, s, t):
        th = self.theme; t0 = s['t0']; job = self.job
        p = ease((t - t0) / .45)
        icon = self.S.icon(job.icon, 170)
        y = 372
        if icon:
            y = 282
            put(fr, icon, (W - icon.width) / 2, y + (1 - p) * 26, p)
            y += icon.height + 30
        title_size = fit_size(job.name, 108 if not icon else 96, W - 2 * SAFE_X, 800)
        rows = [(job.name, title_size, th['text'], 800)]
        for l in job.cta['lines']:
            rows.append((l, fit_size(l, 50, W - 2 * SAFE_X, 600), th['accent'], 600))
        for txt, size, col, wg in rows:
            im = sprite(txt, size, col, wg)
            put(fr, im, (W - im.width) / 2, y + (1 - p) * 26, p)
            y += int(size * 1.34)
        q = ease((t - t0 - .25) / .4)
        bw, bh = 860, 148
        by = max(760, y + 40)
        btn = Image.new('RGBA', (bw, bh), (0, 0, 0, 0))
        ImageDraw.Draw(btn).rounded_rectangle((0, 0, bw - 1, bh - 1), 40, fill=th['accent'] + (255,))
        put(fr, btn, (W - bw) / 2, by + (1 - q) * 30, q)
        label = job.cta['button']
        lab = sprite(label, fit_size(label, 50, bw - 70), th['on'], 700)
        put(fr, lab, (W - lab.width) / 2, by + (bh - lab.height) / 2 + (1 - q) * 30, q)
        if job.disclaimer:
            d = sprite(job.disclaimer, fit_size(job.disclaimer, 34, W - 2 * SAFE_X, 500), th['text'], 500)
            put(fr, d, (W - d.width) / 2, SAFE_B - 60, q)

    def draw(self, s, t, fr):
        {'hook': self.hook_frame, 'body': self.body_frame, 'outro': self.outro_frame}[s['kind']](fr, s, t)

    def frame(self, t, xf=.2):
        for i, s in enumerate(self.scenes):
            if s['t0'] <= t < s['t1']:
                fr = self.bg.copy(); self.draw(s, t, fr)
                if i > 0 and t < s['t0'] + xf and s.get('motion') not in ('swipe', 'page'):
                    o = self.bg.copy(); self.draw(self.scenes[i - 1], t, o)
                    fr = Image.blend(o, fr, smooth((t - s['t0']) / xf))
                return fr
        return self.frame(self.end - .05)

    def review_times(self):
        """One moment per scene that shows it settled."""
        return [s['t1'] - .12 if s['kind'] == 'hook' else min(s['t1'] - .1, s['t0'] + max(1.2, (s['t1'] - s['t0']) * .8))
                for s in self.scenes]

    def strip(self, scale=.25):
        """A review strip: one frame from each scene, side by side."""
        tw, th = int(W * scale), int(H * scale)
        frames = [self.frame(t).resize((tw, th), Image.LANCZOS) for t in self.review_times()]
        gap = 10
        sh = Image.new('RGB', (len(frames) * (tw + gap) + gap, th + 2 * gap), (24, 18, 16))
        for i, im in enumerate(frames):
            sh.paste(im, (gap + i * (tw + gap), gap))
        return sh

    def encode(self, out, audio=None):
        n = int(self.end * FPS)
        cmd = [FFMPEG, '-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
               '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-']
        if audio:
            cmd += ['-i', audio, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,apad']
        cmd += ['-t', f'{n / FPS:.3f}', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p']
        if audio:
            cmd += ['-c:a', 'aac', '-b:a', '192k', '-ar', '44100']
        cmd += ['-movflags', '+faststart', out]
        p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        try:
            for i in range(n):
                p.stdin.write(self.frame(i / FPS).tobytes())
        finally:
            p.stdin.close()
            p.wait()
        if p.returncode:
            raise RuntimeError(f'ffmpeg failed with code {p.returncode} for {out}')
        return round(n / FPS, 2)


# ---------- stills ----------
def _button(fr, theme, label, cx, y, bw, bh, size):
    btn = Image.new('RGBA', (bw, bh), (0, 0, 0, 0))
    ImageDraw.Draw(btn).rounded_rectangle((0, 0, bw - 1, bh - 1), int(bh * .3), fill=theme['accent'] + (255,))
    put(fr, btn, cx - bw / 2, y)
    lab = sprite(label, fit_size(label, size, bw - 60), theme['on'], 700)
    put(fr, lab, cx - lab.width / 2, y + (bh - lab.height) / 2)

def still(job, hook, S, size='9x16'):
    """An image ad: the hook, one benefit line, the phone with the real screen, the button."""
    th = job.theme
    width, height = (W, H) if size == '9x16' else (W, 1350)
    fr = Image.new('RGB', (width, height), th['bg'])
    g = Image.new('L', (width, height), 0)
    ImageDraw.Draw(g).ellipse((-260, -760, width + 260, int(height * .4)), fill=255)
    fr.paste(Image.new('RGB', (width, height), th['glow']), (0, 0), g.filter(ImageFilter.GaussianBlur(190)))
    words = hook['say'].split()
    top, fs = (SAFE_T, 92) if size == '9x16' else (78, 84)
    lines = wrap(words, fs, width - 2 * SAFE_X, display=job.display)
    while len(lines) > 3:
        fs -= 6; lines = wrap(words, fs, width - 2 * SAFE_X, display=job.display)
    n_q = hook.get('accent_from', next((n for n, w in enumerate(words) if w[-1] in '.?'), len(words) - 1) + 1) - 1
    y = top; i = 0; f = F(fs)
    for line in lines:
        x = SAFE_X
        for w in line:
            word = shown(w, job.display)
            put(fr, sprite(word, fs, th['accent'] if i > n_q else th['text']), x, y)
            x += f.getlength(word + ' '); i += 1
        y += int(fs * 1.14)
    y += 14
    benefit = job.benefit(hook)
    if benefit:
        for line in wrap(benefit.split(), 42, width - 2 * SAFE_X, 500)[:2]:
            put(fr, sprite(' '.join(line), 42, th['accent'], 500), SAFE_X, y)
            y += 54
    if job.disclaimer:
        put(fr, sprite(job.disclaimer, fit_size(job.disclaimer, 30, width - 2 * SAFE_X, 500), th['text'], 500), SAFE_X, y + 4)
        y += 40
    key = job.still_screen(hook)
    if size == '9x16':
        draw_phone(fr, S, ('static', key), y + 26, 640)
        _button(fr, th, job.cta['button'], width / 2, SAFE_B - 112, 800, 112, 46)
    else:
        # The phone runs off the bottom edge; the button sits over its lower half
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        draw_phone(layer, S, ('static', key), 0, 560)
        ph = layer.crop((0, 0, W, height - y - 36))
        fr.paste(ph, (0, y + 36), ph)
        _button(fr, th, job.cta['button'], width / 2, height - 60 - 100, 740, 100, 42)
    return fr
