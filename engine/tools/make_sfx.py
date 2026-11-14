"""Makes candidate sound effects with ElevenLabs, then installs the ones picked by ear.

    ELEVENLABS_API_KEY=... .venv/bin/python -m tools.make_sfx make OUT [--takes 4] [--only whoosh,tap]
    .venv/bin/python -m tools.make_sfx install whoosh=OUT/whoosh-3.mp3 tap=OUT/tap-2.mp3 ...

make writes OUT/<sound>-<take>.mp3; each take costs a few credits, and this is run once, not per
ad. install trims the silence, peaks each sound at -1 dBFS and writes assets/sfx/<sound>.wav,
which forge_engine/sfx.py mixes into the ads.
"""
import argparse
import os
import subprocess
import sys
import wave

import numpy as np
import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from forge_engine import render, sfx  # noqa: E402

API = 'https://api.elevenlabs.io/v1/sound-generation'

# (name, seconds, prompt): the sounds an ad needs, described as a sound designer would
SOUNDS = [
    ('whoosh', 0.8, 'Soft, smooth, airy whoosh transition for a premium app commercial. Clean and subtle, '
                    'quick swell and fade, no rumble, no noise hiss.'),
    ('tap', 0.5, 'A single soft, crisp tap on a glass phone screen. Clean modern interface click, very short, '
                 'no reverb.'),
    ('typing', 1.2, 'A short burst of soft, quiet typing on a premium laptop keyboard, about six keystrokes, '
                    'close and clean, no room noise.'),
    ('hit', 1.6, 'Elegant logo reveal for a tech commercial: a gentle airy rise into a warm, soft low hit '
                 'with a subtle shimmer tail. Polished and understated.'),
]


def generate(key, text, seconds, model):
    r = requests.post(API, headers={'xi-api-key': key, 'Content-Type': 'application/json'}, timeout=120,
                      json={'text': text, 'duration_seconds': seconds, 'prompt_influence': .6, 'model_id': model})
    if r.status_code != 200:
        raise RuntimeError(f'{r.status_code}: {r.text[:200]}')
    return r.content


def make(a):
    key = os.environ.get('ELEVENLABS_API_KEY')
    if not key:
        sys.exit('ELEVENLABS_API_KEY is not set')
    os.makedirs(a.out, exist_ok=True)
    only = set(filter(None, a.only.split(',')))
    for name, seconds, text in SOUNDS:
        if only and name not in only:
            continue
        for i in range(1, a.takes + 1):
            path = os.path.join(a.out, f'{name}-{i}.mp3')
            with open(path, 'wb') as f:
                f.write(generate(key, text, seconds, a.model))
            print(path)


def install(a):
    os.makedirs(sfx.DIR, exist_ok=True)
    for pick in a.picks:
        name, _, src = pick.partition('=')
        if name not in sfx.SOUNDS or not os.path.exists(src):
            sys.exit(f'expected <sound>=<file> with sound one of {", ".join(sfx.SOUNDS)}: {pick}')
        out = sfx.path(name)
        # Mono 44.1 kHz, silence trimmed from both ends, a 10 ms fade so the cut never clicks
        trim = 'silenceremove=start_periods=1:start_threshold=-55dB'
        subprocess.run([render.FFMPEG, '-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-ac', '1',
                        '-ar', str(sfx.RATE), '-af', f'{trim},areverse,{trim},afade=t=in:d=0.01,areverse',
                        '-c:a', 'pcm_s16le', out], check=True)
        with wave.open(out) as w:
            x = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float64)
        x *= 32767 * 10 ** (-1 / 20) / max(np.abs(x).max(), 1)
        with wave.open(out, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sfx.RATE)
            w.writeframes(x.astype('<i2').tobytes())
        print(f'{out}: {len(x) / sfx.RATE:.2f}s, loudest at {sfx.load(name)[1]:.2f}s')


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest='cmd', required=True)
    m = sub.add_parser('make')
    m.add_argument('out')
    m.add_argument('--takes', type=int, default=4)
    m.add_argument('--only', default='')
    m.add_argument('--model', default='eleven_text_to_sound_v3')
    i = sub.add_parser('install')
    i.add_argument('picks', nargs='+')
    a = p.parse_args()
    {'make': make, 'install': install}[a.cmd](a)


if __name__ == '__main__':
    main()
