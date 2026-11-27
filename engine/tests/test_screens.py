"""Screens that don't fit the phone: a tablet screenshot is shown whole instead of cropped, and a
zoom asked for on an empty stretch of a screen moves to where the content is.

    .venv/bin/python -m tests.test_screens       from engine/
"""
import os
import sys
import tempfile

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from forge_engine import render  # noqa: E402


def test_wide_screenshot_is_shown_whole():
    # An iPad-shaped screenshot with a red bar down each side edge
    im = Image.new('RGB', (2048, 1536), (240, 240, 240))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 60, 1535), fill=(220, 0, 0)); d.rectangle((1987, 0, 2047, 1535), fill=(220, 0, 0))
    out = render.fit(im, render.SCREEN_W, render.SCREEN_H)
    assert out.size == (render.SCREEN_W, render.SCREEN_H)
    mid = render.SCREEN_H // 2
    assert out.getpixel((4, mid))[0] > 180 and out.getpixel((render.SCREEN_W - 5, mid))[0] > 180, 'both edges kept'
    # A phone-shaped screenshot still fills the screen
    phone = Image.new('RGB', (1179, 2556), (10, 120, 200))
    assert render.fit(phone, render.SCREEN_W, render.SCREEN_H).getpixel((4, 4)) == (10, 120, 200)


def test_empty_zoom_moves_to_the_content():
    im = Image.new('RGB', (1179, 2556), (250, 250, 250))
    d = ImageDraw.Draw(im)
    for i in range(12):  # rows of "content" in the bottom third only
        d.rectangle((90, 1750 + i * 60, 1090, 1780 + i * 60), fill=(30, 30, 30))
    path = os.path.join(tempfile.mkdtemp(), 'sparse.png')
    im.save(path)
    S = render.Screens({'s': {'path': path, 'kind': 'image', 'status_bar': True}})
    a, b = S.busy_band('s', .2, .5)
    assert a > .55 and abs((b - a) - .3) < .02, (a, b)
    assert S.busy_band('s', .62, .92) == (.62, .92), 'a band with content stays where it was asked for'
    S.close()


if __name__ == '__main__':
    for name, fn in list(globals().items()):
        if name.startswith('test_'):
            fn()
            print(name, 'passed')
