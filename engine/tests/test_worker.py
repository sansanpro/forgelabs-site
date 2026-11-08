"""The worker's checks on a batch spec, without Supabase: a spec shaped like the one
assets/studio.js builds is turned into an engine job and previewed, and specs that reach into
another account or break the limits are refused.

    .venv/bin/python -m tests.test_worker        from engine/ (needs tests/fixture/: run make_fixture first)
"""
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import worker  # noqa: E402
from forge_engine import pack  # noqa: E402

OWNER = '11111111-1111-1111-1111-111111111111'
FIX = os.path.join(HERE, 'fixture')


class FakeSupabase:
    """Serves uploads from tests/fixture/ by file name, as if they were in storage."""
    def download(self, bucket, path, dest):
        assert bucket == 'studio-uploads'
        shutil.copy(os.path.join(FIX, path.rsplit('/', 1)[-1]), dest)


def spec(**over):
    p = f'{OWNER}/proj/'
    s = {
        'brand': {'name': 'Habitly', 'spoken_name': '', 'icon': 'a-icon', 'theme': {'style': 'light', 'accent': '#3B82F6'}},
        'screens': {
            'a-today': {'path': p + 'today.png', 'kind': 'image', 'status_bar': True},
            'a-done': {'path': p + 'done.png', 'kind': 'image', 'status_bar': True},
            'a-stats': {'path': p + 'stats.png', 'kind': 'image', 'status_bar': True},
            'a-rec': {'path': p + 'scroll.mp4', 'kind': 'video', 'status_bar': True},
            'a-icon': {'path': p + 'icon.png', 'kind': 'icon', 'status_bar': True},
        },
        'hooks': [{'id': 'h1-comparison', 'say': "It's like Duolingo, but for your habits.", 'benefit': 'Streaks that stick.', 'accent_from': 4}],
        'opening': {'style': 'hand', 'motion': 'page', 'screens': ['a-today', 'a-done', 'a-stats']},
        'body': [
            {'say': 'Tick off a habit and watch your day fill up.', 'head': 'Tap to tick it off', 'screen': 'a-rec', 'motion': 'play'},
            {'say': "Every streak shows how far you've come.", 'head': 'See your streaks', 'screen': 'a-stats', 'motion': 'page'},
            {'say': 'Your best week, in one chart.', 'head': 'Your best week', 'screen': 'a-stats', 'motion': 'zoom', 'zoom': [0.12, 0.5]},
        ],
        'cta': {'say': 'Download Habitly free on the App Store.', 'button': 'Download free on the App Store', 'lines': ['Build habits that stick.'], 'headline': ''},
        'voice': {'id': 'JBFqnCBsd6RMkjVDRZzb', 'speed': 1.15},
        'disclaimer': '',
    }
    s.update(over)
    return s


def refused(s, why):
    d = tempfile.mkdtemp()
    try:
        worker.build_job(s, OWNER, d, FakeSupabase())
    except ValueError as e:
        print(f'refused as expected ({why}): {e}')
        return True
    finally:
        shutil.rmtree(d, ignore_errors=True)
    print(f'FAILED: not refused ({why})')
    return False


def main():
    ok = True
    d = tempfile.mkdtemp()
    try:
        job = worker.build_job(spec(), OWNER, d, FakeSupabase())
        assert job.voice['id'] == 'JBFqnCBsd6RMkjVDRZzb' and job.icon
        m = pack.make_preview(job, os.path.join(d, 'out'), log=lambda *_: None)
        assert m['strips'], m
        print('spec from the app: built and previewed', m['strips'])
    finally:
        shutil.rmtree(d, ignore_errors=True)

    s = spec(); s['screens']['a-today']['path'] = '22222222-2222-2222-2222-222222222222/proj/today.png'
    ok &= refused(s, "another account's file")
    s = spec(); s['screens']['a-today']['path'] = f'{OWNER}/../x/today.png'
    ok &= refused(s, 'path traversal')
    ok &= refused(spec(hooks=[]), 'no hooks')
    ok &= refused(spec(hooks=[{'id': f'h{i}', 'say': 'A hook that says something.'} for i in range(6)]), 'six hooks')
    ok &= refused(spec(body=[{'say': 'Words', 'screen': 'nope', 'motion': 'rise'}]), 'unknown screen')
    s = spec(); s['screens']['a-today']['path'] = f'{OWNER}/proj/today.gif'
    ok &= refused(s, 'unsupported file type')

    d = tempfile.mkdtemp()
    try:
        job = worker.build_job(spec(voice={'id': 'someone-elses-cloned-voice', 'speed': 9}), OWNER, d, FakeSupabase())
        assert job.voice['id'] == 'JBFqnCBsd6RMkjVDRZzb' and job.voice['speed'] == 1.2
        print('unknown voice and speed fall back to George at 1.2')
    finally:
        shutil.rmtree(d, ignore_errors=True)
    print('passed' if ok else 'FAILED')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
