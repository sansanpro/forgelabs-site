"""ElevenLabs calls through voice.post, with a stand-in for the network: a dropped connection and
a 429 are waited out and tried again, and a call that keeps failing gives up.

    .venv/bin/python -m tests.test_voice        from engine/
"""
import os
import sys
from types import SimpleNamespace

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from forge_engine import voice  # noqa: E402


def answers(*replies):
    """requests.post that gives each reply in turn: an exception is raised, a number is a status."""
    calls = []

    def post(url, **kw):
        calls.append(url)
        r = replies[len(calls) - 1]
        if isinstance(r, Exception):
            raise r
        return SimpleNamespace(status_code=r)
    return post, calls


def main():
    real_post, real_sleep = requests.post, voice.time.sleep
    voice.time.sleep = lambda s: None
    try:
        reset = requests.ConnectionError('An existing connection was forcibly closed by the remote host')
        requests.post, calls = answers(reset, 429, 200)
        assert voice.post('https://api.elevenlabs.io/x').status_code == 200 and len(calls) == 3
        print('a dropped connection and a 429 are tried again')

        requests.post, calls = answers(*[reset] * 5)
        try:
            voice.post('https://api.elevenlabs.io/x')
            raise AssertionError('should have given up')
        except requests.ConnectionError:
            assert len(calls) == 5
        print('five dropped connections give up')

        requests.post, calls = answers(*[429] * 5)
        assert voice.post('https://api.elevenlabs.io/x').status_code == 429 and len(calls) == 5
        print('five 429s return the last answer')
    finally:
        requests.post, voice.time.sleep = real_post, real_sleep
    print('passed')
    return 0


if __name__ == '__main__':
    sys.exit(main())
