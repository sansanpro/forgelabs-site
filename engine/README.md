# The App Ad Studio engine

The engine turns a **job** (JSON) into a test pack of 9:16 video ads, stills, captions, ad copy and a test plan. It's generalized from the renderer that made StockMatcherAI's ads ([docs/HOW-THE-ADS-ARE-MADE.md](../docs/HOW-THE-ADS-ARE-MADE.md)). The golden test checks it still reproduces the approved x2 ad.

```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m forge_engine.cli preview JOB.json --out OUT    # review strips, no voice, seconds
.venv/bin/python -m forge_engine.cli pack JOB.json --out OUT       # the pack; spends ElevenLabs credits
.venv/bin/python -m forge_engine.cli frames JOB.json --hook ID --at 0,1.2 --out OUT [--estimate]
.venv/bin/python worker.py                                         # renders the Studio's queue
```

`ELEVENLABS_API_KEY` must be set for a pack, unless every hook has a prerecorded voice.

## Files

| File | What it does |
|---|---|
| `forge_engine/job.py` | Loads and checks a job, fills in defaults |
| `forge_engine/theme.py` | Builds a readable theme from a brand colour |
| `forge_engine/render.py` | Draws frames; encodes videos, review strips and stills |
| `forge_engine/voice.py` | ElevenLabs voiceover with word timing, and the product-name check |
| `forge_engine/pack.py` | Builds the preview or the pack: files, captions, ad copy, test plan, zip |
| `worker.py` | Takes jobs from Supabase, checks them as untrusted input, renders, uploads |
| `tools/make_hand_asset.py` | Cuts a green-screen hand photo into `assets/hand-phone.png` |
| `tests/test_golden.py` | Re-renders StockMatcherAI's x2 and compares it with frames from the shipped video |
| `tests/make_fixture.py`, `tests/fixture.job.json` | A made-up habit tracker with screenshots, a recording and an icon |
| `tests/test_worker.py` | The worker's checks, without Supabase |

## The job format

Paths are relative to the job file. Every hook shares the body and the call to action, so a test compares only the hooks.

```json
{
  "brand": {
    "name": "Habitly",
    "spoken_name": "Habit-lee",
    "icon": "icon",
    "theme": {"style": "dark", "accent": "#3B82F6"}
  },
  "screens": {
    "today":  {"path": "shots/today.png", "status_bar": true},
    "scroll": {"path": "shots/scroll.mp4"},
    "icon":   {"path": "shots/icon.png", "kind": "icon"}
  },
  "hooks": [
    {"id": "h1-comparison", "say": "It's like Duolingo, but for your habits.",
     "benefit": "Streaks you can see make it stick.", "accent_from": 4}
  ],
  "opening": {"style": "hand", "motion": "page", "screens": ["today", "done", "stats"]},
  "body": [
    {"say": "Tick off a habit and watch your day fill up.", "head": "Tap to tick it off", "screen": "scroll", "motion": "play"},
    {"say": "Every streak shows how far you've come.", "head": "See your streaks", "screen": "stats", "motion": "page"},
    {"say": "Your best week, in one chart.", "head": "Your best week", "screen": "stats", "motion": "zoom", "zoom": [0.12, 0.5]}
  ],
  "cta": {"say": "Download Habitly free on the App Store.", "button": "Download free on the App Store",
          "lines": ["Build habits that stick."], "headline": "Download Habitly free"},
  "voice": {"id": "JBFqnCBsd6RMkjVDRZzb", "speed": 1.15},
  "disclaimer": "",
  "outputs": {"video": true, "stills": ["9x16", "4x5"], "srt": true}
}
```

### brand
- **`name`** is shown on screen.
- **`spoken_name`** is how the voice spells it.
- **`icon`** is a screen key; the icon goes on the end card.
- **`theme`** takes `style` (`dark` or `light`) and `accent`, and optionally `bg`, `glow`, `text`, `on` and `highlight`. When `bg` is given with `accent`, both are used exactly as given; otherwise the accent is adjusted until text on it is readable.

### screens
- **`kind`** is one of `image`, `video`, `card` or `icon`. It's worked out from the file extension if you leave it out.
- **`status_bar`**: `true` (the default) means a screenshot taken on a phone, with its own status bar. `false` is for captures without one: a status bar is drawn above them, as StockMatcherAI's browser captures needed.

### hooks
- **`screen`**: the screen behind the hook (optional).
- **`accent_from`**: the index of the first word in the accent colour, counting from 0. Leave it out and the accent starts at the second sentence.
- **`voice`**: `{audio, words}`, a prerecorded voiceover. The golden test uses this.

### opening
| `style` | What happens |
|---|---|
| `hand` | A hand holds the phone, already swiping on frame one |
| `phone` | The drawn phone, already swiping |
| `rise` | The phone slides up |

The swipe (`motion`) is one of:
- `page`: swipes across your screens. Any three work.
- `card`: StockMatcherAI's card cutouts. Takes `screens` (two deck screens) and `cards` (two cards).

### body motions
| `motion` | What happens |
|---|---|
| `rise` | The phone slides up |
| `page` | Swipes across from the previous scene's screen |
| `zoom` | Enlarges a band of the screen: `zoom: [top, bottom]` as shares of the phone's height |
| `play` | A screen recording plays inside the phone |
| `swipe` | A card cutout flies off: `card`, `dir` |

### Other fields
- **`voice`**: an ElevenLabs voice. `id`, `model` (default `eleven_v4`), `seed`, `speed`, `stability` and `similarity`.
- **`display`**: extra spoken-to-written spellings for captions, such as `{"P.E.": "P/E"}`. Dotted letters like "A.I." are always shown as "AI".

## Output

```
OUT/videos/<hook>.mp4                    1080x1920, 30 fps, H.264, AAC, -16 LUFS, captions burned in
OUT/images/<hook>-9x16.png, -4x5.png
OUT/captions/<hook>.srt
OUT/ad-copy.txt, test-plan.txt, manifest.json
OUT/<name>-ad-pack.zip                   everything above
```

A preview writes one `<hook>-preview.jpg` strip per hook: one frame from each scene, side by side.

## Licences

- `assets/fonts/Inter.ttf` is under the SIL Open Font License (`OFL.txt`).
- `assets/hand-phone.png` comes from an AI image generated in Canva. **Check Canva's terms cover commercial use in a product before charging for the hand opening.**
