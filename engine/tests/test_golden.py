"""Golden test: StockMatcherAI's approved x2 ad, re-rendered through the job format, must match
frames of the video that shipped (tests/golden/reference/*.jpg, taken from
x2-revenue-british.mp4). Uses x2's own captures and voiceover, so it spends no credits.

    .venv/bin/python -m tests.test_golden            from engine/
    .venv/bin/python -m tests.test_golden --sheet    also writes a side-by-side sheet

Frames are compared at quarter size, where H.264 noise in the reference averages out but a
moved phone, a wrong screen or a missing caption doesn't.
"""
import os
import sys

from PIL import Image, ImageChops, ImageStat

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from forge_engine import job as jobs, pack, render  # noqa: E402

TIMES = [0, .3, 1.2, 3.5, 6, 10, 14, 17, 20]
LIMIT = 4.0  # mean absolute difference per channel, 0-255, at quarter size


def diff(a, b):
    a = a.convert('RGB').resize((270, 480), Image.LANCZOS)
    b = b.convert('RGB').resize((270, 480), Image.LANCZOS)
    return sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / 3


def main():
    job = jobs.load(os.path.join(HERE, 'golden', 'x2.job.json'))
    h = job.hooks[0]
    _, words, _ = pack.voice_for(job, h, os.path.join(HERE, 'out'))
    S = render.Screens(job.screens)
    ad = render.Ad(job, h, words, S)
    worst, rows = 0, []
    for t in TIMES:
        ref = Image.open(os.path.join(HERE, 'golden', 'reference', f'{t:05.2f}.jpg'))
        got = ad.frame(t)
        d = diff(got, ref)
        worst = max(worst, d)
        rows.append((t, ref, got, d))
        print(f't={t:5.2f}s  difference {d:5.2f}  {"ok" if d <= LIMIT else "FAIL"}')
    S.close()
    if '--sheet' in sys.argv:
        tw, th = 270, 480
        sheet = Image.new('RGB', (len(rows) * (tw + 8) + 8, 2 * th + 24), (40, 40, 40))
        for i, (t, ref, got, d) in enumerate(rows):
            sheet.paste(ref.convert('RGB').resize((tw, th)), (8 + i * (tw + 8), 8))
            sheet.paste(got.convert('RGB').resize((tw, th)), (8 + i * (tw + 8), 16 + th))
        os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
        sheet.save(os.path.join(HERE, 'out', 'golden-sheet.jpg'), quality=85)
        print('sheet: tests/out/golden-sheet.jpg (top: shipped, bottom: engine)')
    if worst > LIMIT:
        print(f'FAILED: worst difference {worst:.2f} > {LIMIT}')
        return 1
    print(f'passed: worst difference {worst:.2f}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
