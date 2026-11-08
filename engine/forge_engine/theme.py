"""Turns a customer's brand colour into an ad theme that stays readable.

A theme is the background, its glow, the text colour, the accent (hook emphasis, benefit
line, button) and the button label colour, plus the caption highlight. Explicit colours in
the job win; anything missing is derived from the accent and the light or dark style, and
the accent is nudged until it meets 4.5:1 against the background.
"""


def hex_rgb(v):
    if isinstance(v, (list, tuple)):
        return tuple(int(c) for c in v[:3])
    v = str(v).lstrip('#')
    if len(v) == 3:
        v = ''.join(c * 2 for c in v)
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    """t of a, the rest b."""
    return tuple(round(a[i] * t + b[i] * (1 - t)) for i in range(3))


def luminance(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= .03928 else ((v + .055) / 1.055) ** 2.4
    r, g, b = (ch(x) for x in c)
    return .2126 * r + .7152 * g + .0722 * b


def contrast(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + .05) / (lb + .05)


def _towards(c, target, against, need):
    """Moves c towards target until it reaches the contrast it needs against `against`."""
    for i in range(21):
        out = mix(target, c, i / 20)
        if contrast(out, against) >= need:
            return out
    return target


def build(spec=None):
    spec = dict(spec or {})
    style = spec.get('style', 'dark')
    accent = hex_rgb(spec.get('accent', '#FF7A2E'))
    if style == 'light':
        bg = hex_rgb(spec['bg']) if 'bg' in spec else mix(accent, (255, 255, 255), .05)
        text = hex_rgb(spec['text']) if 'text' in spec else (26, 18, 22)
        accent = hex_rgb(spec['accent']) if 'accent' in spec and 'bg' in spec else _towards(accent, (0, 0, 0), bg, 4.5)
        glow = hex_rgb(spec['glow']) if 'glow' in spec else mix(accent, bg, .16)
    else:
        bg = hex_rgb(spec['bg']) if 'bg' in spec else mix(accent, (12, 8, 10), .08)
        text = hex_rgb(spec['text']) if 'text' in spec else (250, 243, 238)
        accent = hex_rgb(spec['accent']) if 'accent' in spec and 'bg' in spec else _towards(accent, (255, 255, 255), bg, 4.5)
        glow = hex_rgb(spec['glow']) if 'glow' in spec else mix(accent, bg, .26)
    if 'on' in spec:
        on = hex_rgb(spec['on'])
    else:
        dark, white = (30, 16, 22), (255, 255, 255)
        on = dark if contrast(dark, accent) >= contrast(white, accent) else white
    # Captions sit on a dark pill on every theme, so the highlight is measured against that
    pill = (20, 10, 16)
    highlight = hex_rgb(spec['highlight']) if 'highlight' in spec else _towards(mix(accent, (255, 255, 255), .7), (255, 255, 255), pill, 7)
    return dict(style=style, bg=bg, glow=glow, text=text, accent=accent, on=on, highlight=highlight)
