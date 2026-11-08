"""Draws a made-up habit tracker ("Habitly") to test the engine on things StockMatcherAI's ads
never used: phone screenshots with their own status bar, a screen recording, an app icon.

    .venv/bin/python -m tests.make_fixture       writes tests/fixture/
"""
import os
import subprocess
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from forge_engine.render import FFMPEG, F  # noqa: E402

OUT = os.path.join(HERE, 'fixture')
W, H = 1179, 2556
BLUE, INK, MUTED, BG = (59, 130, 246), (17, 24, 39), (107, 114, 128), (248, 250, 252)
HABITS = ['Drink water', 'Read 10 pages', 'Walk 8,000 steps', 'Meditate', 'No phone after 10pm',
          'Stretch', 'Journal', 'Practice Spanish', 'Cook at home', 'Sleep by 11']


def status_bar(d, ink=INK):
    d.text((128, 52), '9:41', font=F(52, 600), fill=ink)
    for i, h in enumerate((18, 26, 34, 42)):
        d.rounded_rectangle((W - 250 + i * 18, 104 - h, W - 238 + i * 18, 104), 3, fill=ink)
    d.rounded_rectangle((W - 150, 70, W - 76, 106), 10, outline=ink, width=4)
    d.rounded_rectangle((W - 144, 76, W - 96, 100), 6, fill=ink)


def screen(title, rows, done, offset=0, banner=None):
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    status_bar(d)
    d.text((72, 210), title, font=F(96, 800), fill=INK)
    d.text((72, 330), 'Tuesday, 3 of 5 done', font=F(44, 500), fill=MUTED)
    y = 440 - offset
    if banner:
        d.rounded_rectangle((60, y, W - 60, y + 300), 48, fill=BLUE)
        d.text((110, y + 70), banner[0], font=F(64, 800), fill=(255, 255, 255))
        d.text((110, y + 170), banner[1], font=F(44, 500), fill=(219, 234, 254))
        y += 360
    for i, r in enumerate(rows):
        if y > H - 300: break
        if y > 380:
            d.rounded_rectangle((60, y, W - 60, y + 190), 44, fill=(255, 255, 255), outline=(229, 231, 235), width=3)
            on = i in done
            d.ellipse((110, y + 55, 190, y + 135), fill=BLUE if on else (255, 255, 255), outline=BLUE, width=6)
            if on:
                d.line((128, y + 96, 146, y + 114, 174, y + 78), fill=(255, 255, 255), width=10)
            d.text((230, y + 62), r, font=F(56, 600), fill=INK)
            d.text((W - 260, y + 70), f'{(i * 7) % 30 + 3} days', font=F(44, 500), fill=MUTED)
        y += 220
    d.rounded_rectangle((0, H - 230, W, H), 0, fill=(255, 255, 255))
    for i, t in enumerate(['Today', 'Stats', 'Friends']):
        d.text((150 + i * 360, H - 160), t, font=F(44, 700 if i == 0 else 500), fill=BLUE if i == 0 else MUTED)
    return im


def stats():
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    status_bar(d)
    d.text((72, 210), 'Your streaks', font=F(96, 800), fill=INK)
    d.rounded_rectangle((60, 420, W - 60, 1200), 48, fill=(255, 255, 255), outline=(229, 231, 235), width=3)
    for i, h in enumerate([300, 420, 380, 520, 610, 560, 700]):
        x = 150 + i * 135
        d.rounded_rectangle((x, 1120 - h, x + 80, 1120), 20, fill=BLUE)
    d.text((110, 470), 'Best week yet', font=F(60, 800), fill=INK)
    d.rounded_rectangle((60, 1260, W - 60, 1700), 48, fill=(239, 246, 255))
    d.text((110, 1320), '21-day streak', font=F(84, 800), fill=BLUE)
    d.text((110, 1450), 'Drink water, every day since June 2', font=F(44, 500), fill=MUTED)
    return im


def main():
    os.makedirs(OUT, exist_ok=True)
    screen('Today', HABITS, {0, 1, 4}).save(f'{OUT}/today.png')
    screen('Today', HABITS, {0, 1, 4}, banner=('Nice work!', '3 habits done before lunch')).save(f'{OUT}/done.png')
    stats().save(f'{OUT}/stats.png')
    friends = screen('Friends', ['Maya: 12-day streak', 'Sam: 9-day streak', 'Ana: 30-day streak', 'Leo: 4-day streak'], {0, 2})
    friends.save(f'{OUT}/friends.png')
    # A screen recording: scrolling the list and ticking a habit, 5 seconds, at half size
    p = subprocess.Popen([FFMPEG, '-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                          '-s', '590x1278', '-r', '30', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                          f'{OUT}/scroll.mp4'], stdin=subprocess.PIPE)
    for i in range(150):
        off = int(min(i, 100) * 9)
        done = {0, 1, 4} | ({2} if i > 110 else set())
        p.stdin.write(screen('Today', HABITS, done, offset=off).resize((590, 1278)).tobytes())
    p.stdin.close(); p.wait()
    icon = Image.new('RGB', (512, 512), BLUE)
    ImageDraw.Draw(icon).line((150, 270, 225, 345, 370, 180), fill=(255, 255, 255), width=46)
    icon.save(f'{OUT}/icon.png')
    print('wrote', sorted(os.listdir(OUT)))


if __name__ == '__main__':
    main()
