"""Sound effects for an ad, from a small set of recorded sounds in assets/sfx/ (made with
ElevenLabs by tools/make_sfx.py and picked by ear).

    whoosh   a scene change
    tap      something on screen being tapped
    typing   text typing out where nobody is speaking
    hit      the end card landing

render.Ad.sound_cues() lists (time, sound, level) for one ad, where time is when the sound's
loudest moment lands (the middle of a whoosh, the impact of a hit). track() turns the list into a
mono WAV the length of the video, which encode() mixes under the voice.
"""
import os
import wave

import numpy as np

RATE = 44100
DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'sfx')
SOUNDS = ('whoosh', 'tap', 'typing', 'hit')
_cache = {}


def path(name):
    return os.path.join(DIR, f'{name}.wav')


def available():
    return all(os.path.exists(path(n)) for n in SOUNDS)


def load(name):
    """(samples in -1..1, seconds from the start to the loudest moment)."""
    if name not in _cache:
        with wave.open(path(name)) as w:
            if w.getframerate() != RATE or w.getnchannels() != 1 or w.getsampwidth() != 2:
                raise ValueError(f'{name}.wav must be mono 16-bit {RATE} Hz (see tools/make_sfx.py install)')
            x = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float64) / 32768
        k = int(.02 * RATE)  # a 20 ms loudness curve finds the peak, not a stray sample
        env = np.convolve(np.abs(x), np.ones(k) / k, 'same')
        _cache[name] = (x, int(env.argmax()) / RATE)
    return _cache[name]


def track(cues, length, out):
    """Writes the cues into a mono 16-bit WAV of `length` seconds."""
    mix = np.zeros(int(length * RATE) + RATE)
    for at, name, level in sorted(cues):
        x, peak = load(name)
        a = int(round((at - peak) * RATE))
        if a < 0:
            x, a = x[-a:], 0
        b = min(len(mix), a + len(x))
        mix[a:b] += x[:b - a] * level
    mix = mix[:int(length * RATE)]
    top = np.abs(mix).max() if len(mix) else 0
    if top > .98:
        mix *= .98 / top
    with wave.open(out, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((mix * 32767).astype('<i2').tobytes())
    return out
