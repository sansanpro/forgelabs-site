"""The director and the quality check, with a stand-in for Claude: what each one is shown, and
that its answers are checked and applied (moves, zoom bands, headings, sounds, fixes).

    .venv/bin/python -m tests.test_agents        from engine/ (needs tests/fixture/: run make_fixture first)
"""
import json
import os
import sys
from types import SimpleNamespace

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from forge_engine import agents, job as jobs, pack, render  # noqa: E402


class FakeClaude:
    """Answers like the Messages API, from canned replies keyed by the system prompt."""
    def __init__(self, replies):
        self.replies, self.calls = replies, []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self.create))

    def create(self, **kw):
        self.calls.append(kw)
        reply = self.replies[kw['system']]
        reply = reply.pop(0) if isinstance(reply, list) else reply
        return SimpleNamespace(stop_reason='end_turn', content=[
            SimpleNamespace(type='thinking'), SimpleNamespace(type='text', text=json.dumps(reply))])


def fixture():
    with open(os.path.join(HERE, 'fixture.job.json')) as f:
        data = json.load(f)
    data['body'][1]['auto'] = True   # the streaks scene: left on auto
    data['body'][2]['auto'] = True   # friends: on auto, heading empty
    data['body'][2]['head'] = ''
    data['brief'] = {'one_liner': 'A habit tracker with streaks and friends.'}
    data['effects'] = {'sfx': True}
    return jobs.Job(data, HERE)


def scene(n, motion='keep', top=-1, bottom=-1, head='', whoosh=False, tap=-1):
    return {'scene': n, 'motion': motion, 'zoom_top': top, 'zoom_bottom': bottom, 'head': head,
            'whoosh': whoosh, 'tap_word': tap, 'why': 'test'}


def images(content):
    return sum(1 for b in content if b['type'] == 'image')


def test_director():
    job = fixture()
    fake = FakeClaude({agents.DIRECTOR: {'scenes': [
        scene(1, 'zoom', head='ignored, fixed heading', tap=1),   # a recording: the move stays play
        scene(2, 'zoom', .62, .3, head='never shown', whoosh=True),  # auto: zoom, band given upside down
        scene(3, 'page', head='Friends keep you going, every single day', whoosh=True),  # auto, empty heading
        scene(4, 'rise'),                                           # fixed zoom: kept
    ]}})
    S = render.Screens(job.screens)
    new, answer = agents.direct(job, S, fake)
    S.close()
    call = fake.calls[0]
    assert images(call['messages'][0]['content']) == 4, 'one screenshot per scene'
    text = ' '.join(b.get('text', '') for b in call['messages'][0]['content'])
    assert 'Scene 2: says [0]Every [1]streak' in text and 'Move: auto' in text and 'play (fixed)' in text
    assert call['output_config']['format']['schema'] is agents.DIRECTOR_SCHEMA
    b = new.body
    assert b[0]['motion'] == 'play' and b[0]['head'] == 'Tap to tick it off'
    assert b[0]['sfx'] == [{'sound': 'tap', 'word': 1}]
    assert b[1]['motion'] == 'zoom' and b[1]['zoom'] == [.3, .62] and b[1]['head'] == 'See your streaks'
    assert b[2]['motion'] == 'page' and b[2]['from'] == 'stats' and len(b[2]['head']) <= 28
    assert b[2]['sfx'] == [{'sound': 'whoosh'}]
    assert b[3]['motion'] == 'zoom' and b[3]['zoom'] == [.12, .5]
    # Its sounds land on the move and the word, and the end card always gets a hit
    words = render.estimate_words(new.script(new.hooks[0]), 1.15)
    ad = render.Ad(new, new.hooks[0], words, render.Screens(new.screens))
    cues = ad.sound_cues()
    sounds = [c[1] for c in cues]
    assert sounds == ['tap', 'whoosh', 'whoosh', 'hit'], sounds
    tick = next(s for s in ad.scenes if s['kind'] == 'body')
    assert abs(cues[0][0] - (words[tick['a'] + 1]['s'] + .05)) < 1e-6, 'the tap is on "a" after "Tick"'
    ad.S.close()


def test_director_limits():
    job = fixture()
    fake = FakeClaude({agents.DIRECTOR: {'scenes': [
        scene(2, 'page'),            # auto, but the previous scene shows a different screen: allowed
        scene(3, 'zoom', .5, .52),   # a band too thin: falls back to rise
    ]}})
    new, _ = agents.direct(job, render.Screens(job.screens), fake)
    assert new.body[1]['motion'] == 'page'
    assert new.body[2]['motion'] == 'rise' and 'zoom' not in new.body[2]
    assert 'sfx' not in new.body[0], 'a scene the director skipped keeps the default sounds'


def test_no_key():
    old = os.environ.pop('ANTHROPIC_API_KEY', None)
    try:
        job = fixture()
        assert not agents.available()
        assert pack.direct(job) == (job, None)
    finally:
        if old is not None:
            os.environ['ANTHROPIC_API_KEY'] = old


def test_review():
    job = fixture()
    voices = {h['id']: (None, render.estimate_words(job.script(h), 1.15), None) for h in job.hooks}
    first = {'issues': [{'where': 'Scene 4', 'check': 'zoom', 'problem': 'The band shows the header, not the chart.'},
                        {'where': 'Scene 3', 'check': 'heading', 'problem': 'Says more than the line.'}],
             'fixes': [{'scene': 4, 'zoom_top': .45, 'zoom_bottom': .8, 'head': 'keep'},
                       {'scene': 3, 'zoom_top': -1, 'zoom_bottom': -1, 'head': ''},
                       {'scene': 9, 'zoom_top': .1, 'zoom_bottom': .5, 'head': 'x'}],
             'retake': [], 'summary': 'Two scenes needed fixing.'}
    again = {'issues': [], 'fixes': [], 'retake': [], 'summary': 'Both fixed scenes look right.'}
    fake = FakeClaude({agents.REVIEWER: [first, again]})
    real, agents.client = agents.client, lambda: fake
    S = render.Screens(job.screens)
    try:
        new, voices, q = pack.check_quality(job, voices, S, HERE, log=lambda m: None)
    finally:
        S.close()
        agents.client = real
    full, recheck = (c['messages'][0]['content'] for c in fake.calls)
    # Every hook, every body scene (plus the whole screenshot for the zoom) and the end card
    assert images(full) == 2 + 4 + 1 + 1, images(full)
    assert images(recheck) == 2 + 1, 'the re-check shows only the fixed scenes'
    assert new.body[3]['zoom'] == [.45, .8] and new.body[3]['head'] == 'Your best week'
    assert new.body[2]['head'] == ''
    assert q['fixed_scenes'] == [3, 4] and q['recheck']['summary'].startswith('Both')
    text = pack.quality_text(q)
    assert 'Scene 4 (zoom)' in text and 'Fixed before rendering: scene 3, 4' in text


def test_words_differ():
    assert agents.words_differ("It's like Duolingo, but for your habits.", "its like duolingo but for habits") == ['your']


if __name__ == '__main__':
    os.environ.pop('ELEVENLABS_API_KEY', None)  # no transcripts: nothing to spend
    for name, fn in list(globals().items()):
        if name.startswith('test_'):
            fn()
            print(name, 'passed')
