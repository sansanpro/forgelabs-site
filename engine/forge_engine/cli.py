"""Runs a job from the command line.

    python -m forge_engine.cli preview JOB.json --out DIR          review strips, no voice
    python -m forge_engine.cli pack JOB.json --out DIR             the full pack (spends voice credits)
    python -m forge_engine.cli frames JOB.json --hook ID --at 0,1.2 --out DIR   single frames, for checks

`--hooks a,b` limits a preview or pack to some hooks. ELEVENLABS_API_KEY must be set for a
pack unless every hook has a prerecorded voice.
"""
import argparse
import os
import sys

from . import job as jobs, pack, render


def main(argv=None):
    p = argparse.ArgumentParser(prog='forge_engine')
    p.add_argument('mode', choices=['preview', 'pack', 'frames'])
    p.add_argument('job')
    p.add_argument('--out', required=True)
    p.add_argument('--hooks')
    p.add_argument('--hook')
    p.add_argument('--at', default='0')
    p.add_argument('--estimate', action='store_true', help='frames: estimated timings instead of a voice')
    a = p.parse_args(argv)
    job = jobs.load(a.job)
    hooks = set(a.hooks.split(',')) if a.hooks else None
    if a.mode == 'preview':
        print(pack.make_preview(job, a.out, hooks))
    elif a.mode == 'pack':
        print(pack.make_pack(job, a.out, hooks))
    else:
        h = next(h for h in job.hooks if h['id'] == (a.hook or job.hooks[0]['id']))
        if a.estimate:
            words = render.estimate_words(job.script(h), job.voice.get('speed', 1.0))
        else:
            words = pack.voice_for(job, h, a.out)[1]
        S = render.Screens(job.screens)
        ad = render.Ad(job, h, words, S)
        os.makedirs(a.out, exist_ok=True)
        for t in (float(x) for x in a.at.split(',')):
            path = os.path.join(a.out, f"{pack.slug(h['id'])}-{t:06.2f}.png")
            ad.frame(t).save(path)
            print(path)
        S.close()


if __name__ == '__main__':
    sys.exit(main())
