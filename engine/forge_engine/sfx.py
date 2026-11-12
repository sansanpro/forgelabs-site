"""Sound effects for an ad, synthesized rather than sampled: nothing to license, and the same
job always gives the same sound.

    whoosh   filtered noise sweeping up (or down), for transitions, swipes and zooms
    key      a short keyboard click, one per typed letter
    pop      a soft tonal pop, for a button or icon landing

render.Ad.sound_cues() lists (time, kind, level) for one ad; track() turns the list into a
mono WAV the length of the video, which encode() mixes under the voice.
"""
import random
import wave

import numpy as np

RATE = 44100


def _noise(rng, n):
    return np.random.default_rng(rng.randrange(1 << 30)).standard_normal(n)


def _bandpassed(noise, centres, width=.9):
    """Noise whose pass band follows `centres` (Hz, one per chunk), by overlap-added FFT chunks."""
    n = len(noise)
    chunks = len(centres)
    size = max(256, int(2 * n / (chunks + 1)))
    hop = size // 2
    out = np.zeros(n + size)
    win = np.hanning(size)
    freqs = np.fft.rfftfreq(size, 1 / RATE)
    padded = np.concatenate([noise, np.zeros(size)])
    for i, c in enumerate(centres):
        a = i * hop
        seg = padded[a:a + size] * win
        spec = np.fft.rfft(seg)
        # A gaussian band on a log scale: wide and airy, like air moving past
        spec *= np.exp(-0.5 * (np.log2(np.maximum(freqs, 1) / c) / width) ** 2)
        out[a:a + size] += np.fft.irfft(spec, size)
    return out[:n]


def whoosh(dur=.42, up=True, rng=None, strength=1.0):
    rng = rng or random.Random(1)
    n = int(dur * RATE)
    noise = _noise(rng, n)
    lo, hi = 350, 4200 * strength
    k = np.linspace(0, 1, 24)
    centres = lo * (hi / lo) ** (k if up else 1 - k)
    sig = _bandpassed(noise, centres)
    t = np.linspace(0, 1, n)
    # Swells in, peaks just after the middle, falls away fast
    env = np.sin(np.pi * np.clip(t, 0, 1) ** .8) ** 1.6
    sig = sig * env
    return sig / (np.abs(sig).max() + 1e-9)


def key(rng=None):
    rng = rng or random.Random(2)
    n = int(.045 * RATE)
    t = np.arange(n) / RATE
    click = _noise(rng, n)
    click = np.diff(click, prepend=0) * np.exp(-t / .0025)            # the sharp contact
    tick = np.sin(2 * np.pi * rng.uniform(2300, 3400) * t) * np.exp(-t / .006)
    thock = np.sin(2 * np.pi * rng.uniform(150, 210) * t) * np.exp(-t / .012)  # the key bottoming out
    sig = .55 * click / (np.abs(click).max() + 1e-9) + .3 * tick + .45 * thock
    return sig / (np.abs(sig).max() + 1e-9)


def pop(rng=None):
    n = int(.12 * RATE)
    t = np.arange(n) / RATE
    f = 720 * (340 / 720) ** (t / t[-1])                              # a quick downward bend
    sig = np.sin(2 * np.pi * np.cumsum(f) / RATE) * np.exp(-t / .028)
    return sig / (np.abs(sig).max() + 1e-9)


def track(cues, length, path, seed=7):
    """Writes the cues into a mono 16-bit WAV of `length` seconds."""
    rng = random.Random(seed)
    out = np.zeros(int(length * RATE) + RATE)
    made = {}
    for at, kind, level in sorted(cues):
        if kind == 'key':
            sound = key(rng)                                          # every key a little different
        else:
            if kind not in made:
                made[kind] = {
                    'whoosh': lambda: whoosh(.42, True, rng),
                    'whoosh-down': lambda: whoosh(.38, False, rng),
                    'zoom': lambda: whoosh(.55, True, rng, .7),
                    'zoom-out': lambda: whoosh(.45, False, rng, .7),
                    'pop': lambda: pop(rng),
                }[kind]()
            sound = made[kind]
        a = max(0, int(at * RATE))
        b = min(len(out), a + len(sound))
        out[a:b] += sound[:b - a] * level
    out = out[:int(length * RATE)]
    peak = np.abs(out).max()
    if peak > .98:
        out *= .98 / peak
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((out * 32767).astype('<i2').tobytes())
    return path
