"""Voiceovers with word timing, from ElevenLabs. Spends ElevenLabs credits.

Ported from voiceover.mjs in the StockMatcherAI repo (docs/HOW-THE-ADS-ARE-MADE.md,
section 5): one take per ad, word timings from the character alignment, a fixed seed, and a
check that the product name is said right. Transcribing a whole voiceover hides a misread
name, because speech-to-text corrects it from context, so the check cuts out only the name
and transcribes that clip on its own.
"""
import base64
import json
import os
import re
import subprocess

import requests

from .render import FFMPEG

API = 'https://api.elevenlabs.io/v1'


class VoiceError(RuntimeError):
    pass


def to_words(al):
    words, cur, start, end = [], '', None, 0
    for ch, s, e in zip(al['characters'], al['character_start_times_seconds'], al['character_end_times_seconds']):
        if ch.isspace():
            if cur: words.append({'w': cur, 's': start, 'e': end})
            cur, start = '', None
        else:
            if start is None: start = s
            cur += ch; end = e
    if cur: words.append({'w': cur, 's': start, 'e': end})
    return words


def synthesize(text, cfg, key, seed):
    r = requests.post(f"{API}/text-to-speech/{cfg['id']}/with-timestamps",
                      params={'output_format': 'mp3_44100_128'},
                      headers={'xi-api-key': key, 'Content-Type': 'application/json'},
                      json={'text': text, 'model_id': cfg.get('model', 'eleven_v4'), 'seed': seed,
                            'voice_settings': {'stability': cfg.get('stability', .5),
                                               'similarity_boost': cfg.get('similarity', .75),
                                               'speed': cfg.get('speed', 1.0)}},
                      timeout=120)
    if r.status_code != 200:
        raise VoiceError(f'ElevenLabs text-to-speech failed ({r.status_code}): {r.text[:300]}')
    d = r.json()
    words = to_words(d['alignment'])
    if len(words) != len(text.split()):
        raise VoiceError(f'the voice came back with {len(words)} words for a script of {len(text.split())}')
    return base64.b64decode(d['audio_base64']), words


def transcribe(path, key):
    with open(path, 'rb') as f:
        r = requests.post(f'{API}/speech-to-text', headers={'xi-api-key': key},
                          data={'model_id': 'scribe_v2'}, files={'file': (os.path.basename(path), f, 'audio/mpeg')},
                          timeout=120)
    if r.status_code != 200:
        raise VoiceError(f'ElevenLabs speech-to-text failed ({r.status_code}): {r.text[:300]}')
    return r.json().get('text', '')


def letters(s):
    return re.sub(r'[^a-z0-9]', '', s.lower().replace('&', 'and'))


def find_name(words, spoken):
    """Where the spoken name sits in the words, as (first, last) indexes, or None."""
    want = [letters(w) for w in spoken.split()]
    got = [letters(w['w']) for w in words]
    n = len(want)
    for i in range(len(got) - n, -1, -1):  # the last mention: the call to action
        if got[i:i + n] == want:
            return i, i + n - 1
    return None


def name_check(mp3, words, spoken, display, key):
    """Cuts out the spoken name and transcribes it alone. Returns (passed, heard)."""
    at = find_name(words, spoken)
    if not at:
        return None, ''
    a, b = at
    s = words[a - 1]['e'] if a > 0 else max(0, words[a]['s'] - .05)
    e = words[b + 1]['s'] if b + 1 < len(words) else words[b]['e'] + .05
    clip = mp3[:-4] + '-name.mp3'
    subprocess.run([FFMPEG, '-y', '-hide_banner', '-loglevel', 'error', '-ss', f'{s:.3f}', '-to', f'{e:.3f}',
                    '-i', mp3, clip], check=True)
    heard = transcribe(clip, key)
    ok = letters(heard) in {letters(display), letters(spoken)}
    return ok, heard


def make(text, cfg, base, spoken, display, key=None, tries=1, log=print):
    """Writes base.mp3 and base.json (word timings). Keeps existing files, so a re-run spends
    nothing. Returns (mp3 path, words, name check result).

    One take by default: for an invented name, speech-to-text writes the nearest real word
    ("Habitly" comes back as "habitually"), so a second take fails the same way and only spends
    credits. The result is reported instead, and the app asks the customer to listen. Raise
    `tries` (voice.tries in the job) for a name a voice is known to misread, as "A.I." was."""
    if os.path.exists(base + '.json') and os.path.exists(base + '.mp3'):
        with open(base + '.json') as f:
            saved = json.load(f)
        return base + '.mp3', saved['words'], saved.get('name_check')
    key = key or os.environ.get('ELEVENLABS_API_KEY')
    if not key:
        raise VoiceError('ELEVENLABS_API_KEY is not set')
    os.makedirs(os.path.dirname(base) or '.', exist_ok=True)
    check = None
    for attempt in range(1, tries + 1):
        audio, words = synthesize(text, cfg, key, cfg.get('seed', 41) + attempt - 1)
        with open(base + '.mp3', 'wb') as f:
            f.write(audio)
        ok, heard = name_check(base + '.mp3', words, spoken, display, key)
        check = {'passed': ok, 'heard': heard, 'tries': attempt}
        log(f'voice {os.path.basename(base)} try {attempt}: name heard as {heard!r} '
            f"{'PASS' if ok else ('no name in script' if ok is None else 'retry')}, {words[-1]['e']:.1f}s")
        if ok is not False:
            break
    with open(base + '.json', 'w') as f:
        json.dump({'words': words, 'name_check': check}, f)
    return base + '.mp3', words, check


def load_prerecorded(audio, words_path):
    """A voiceover made earlier: the StockMatcherAI files are a plain list of words."""
    with open(words_path) as f:
        d = json.load(f)
    return audio, (d['words'] if isinstance(d, dict) else d), None


def list_voices(key=None):
    key = key or os.environ.get('ELEVENLABS_API_KEY')
    r = requests.get(f'{API}/voices', headers={'xi-api-key': key}, timeout=60)
    r.raise_for_status()
    return r.json().get('voices', [])
