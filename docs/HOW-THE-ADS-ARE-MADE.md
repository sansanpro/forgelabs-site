# How the StockMatcherAI ads are made

> **About this copy.** This is the case study the App Ad Studio grew out of, copied from the StockMatcherAI repository ([sansanpro/Stockmatcherai-prod](https://github.com/sansanpro/Stockmatcherai-prod), `marketing/ads/HOW-THE-ADS-ARE-MADE.md`). File paths below refer to that repository. The product version of this pipeline is in `engine/` here, and `docs/PLAN.md` explains what changed on the way from one app's ads to a product.

This is the full process behind the video and image ads running on Meta: how a hook is chosen, how the app is captured, how the voiceover is made and checked, how each frame of the video is drawn, how the image ads are built in Canva, and how the ads are put on Meta and swapped. It also records what has worked, what hasn't, and the rules Meta enforces, so the next batch starts from what we already know.

The short version of `README.md` (commands only) is still there. This document explains the why behind each step. `AD-PLAYBOOK.md` is the general version of this process, for any product, service or software.

## Contents

1. [The pipeline at a glance](#1-the-pipeline-at-a-glance)
2. [Writing the hook](#2-writing-the-hook)
3. [Capturing the app](#3-capturing-the-app)
4. [The concepts file](#4-the-concepts-file)
5. [The voiceover](#5-the-voiceover)
6. [Rendering the videos](#6-rendering-the-videos)
7. [The cold-open format (the x-series)](#7-the-cold-open-format-the-x-series)
8. [The image ads](#8-the-image-ads)
9. [Checks before anything ships](#9-checks-before-anything-ships)
10. [Putting the ads on Meta](#10-putting-the-ads-on-meta)
11. [What has worked so far](#11-what-has-worked-so-far)
12. [Rules and lessons](#12-rules-and-lessons)
13. [Commands](#13-commands)
14. [Where everything lives](#14-where-everything-lives)

---

## 1. The pipeline at a glance

```
 hook list ──► concepts.json ──► voiceover.mjs ──► render_videos.py ──► videos/*.mp4 ─┐
                   ▲              (ElevenLabs)      (Pillow + ffmpeg)                  │
                   │                                                                  ├─► Meta
 capture-ad-shots.mjs ──► shots/{light,dark}/*.png ──► Canva designs ──► images/*.png ┘
  (Playwright, the real app)                          render_videos.py stills
```

Everything on screen is the real app, captured from the code in this repo on the day the ads are made. Nothing is mocked up in a design tool. The only generated image is the hand holding the phone in the cold-open videos, and even there the screen in the phone is a real capture.

Each ad has three parts:

| Part | Length | What it does |
|---|---|---|
| Hook | 1–5 s | One line that stops the scroll. This is the only part that changes between ads in a test. |
| Body | 10–14 s | Shows the app solving the problem: swiping, the card's proof and things to know, Ask AI, the recap. |
| Call to action | 3–4 s | "Download StockMatcherAI free on the App Store", spoken and on a button. |

Because ads in the same test share one body, any difference in results comes from the hook.

---

## 2. Writing the hook

The hook decides whether anyone watches the rest, so most of the effort goes here.

### The standard

A hook has to be as instantly clear as **"It's like Tinder, but for stocks."** The test: can a stranger picture the app, or feel the problem, within a couple of seconds of hearing it? Lines that are abstract or poetic fail this test. "Your money is already saying something. Is it what you believe?" is the example: it sounds good but doesn't say what the app is, and it got 1 click from 79 impressions.

### Categories

Hooks are grouped so they can be compared fairly:

- **Gamified**: discovery feels like a game. "It's like Tinder, but for stocks." "It's Tinder, except the matches have revenue."
- **Educational**: removes the vagueness around investing. "Everyone says 'just invest.' Nobody explains in what."
- **Values**: real problems people care about. "You'd donate to fight cancer. Could you name one company working on it?"
- **Anti-gatekeeping, callout and seasonal**: the newer categories the x-series tests (see section 7).

When the owner provides a hook list, use the top-listed hooks in each category as written. Change the wording only where it would make a false claim, and say exactly what was changed and why.

### Every claim is checked against the app

Before a hook is used, each factual claim in it is checked against the code and data. Hooks that were ruled out, and why:

| Hook idea | Problem |
|---|---|
| "…companies curing cancer" | No company in the catalogue has cured anything. |
| "50 causes" | The catalogue has 30. |
| "forty companies" | Not a number the app shows. |
| "twenty matches a day" | Decks are 7 a day free, 12 with Premium, and up to 20 only on day one. |
| Anything implying an advisor | The app gives no advice. |
| "Spotify Wrapped, but for where your money's been going" | The app can't see anyone's money or holdings. Changed to "…where your money could go." |
| "…what you've been funding" | Same problem. Swapped for the next hook in the list. |

The most important fact to remember: **the app cannot see anyone's money, bank account or portfolio.** Any hook that implies it does is false, and it also breaks Meta's personal-attributes rule (section 12).

### The AI wording

Matching is rule-based (`_shared/matching.ts`), not AI. So the ads say **"Matches built around your values, with AI to explain every company"** and never "AI-powered matching". The AI part, Ask AI, is real and shown in the body.

---

## 3. Capturing the app

`scripts/capture-ad-shots.mjs` drives the real app in a headless browser and saves screenshots. It runs against the local dev server, so the shots show exactly what is in the repo, not an old App Store screenshot.

```
npm run dev                              # in one terminal
node scripts/capture-ad-shots.mjs        # in another
```

What it does, in order, once in light mode and once in dark:

1. **Opens the app as a brand-new user** in WebKit (Safari's engine) at iPhone size: 393×852 points at 3× scale, which gives 1179×2556 pixel images, the same as a real iPhone. It marks the install `e2e-adshots-…` so analytics ignore it.
2. **Walks onboarding** like a person would: "Find my matches" → picks *Beat cancer & disease* and *Clean energy & climate* → ticks *Fossil fuels* as a dealbreaker → answers the risk questions → waits for the reveal animation. It saves `hook`, `causes`, `dealbreakers`, `question` and `reveal` along the way.
3. **Captures the first three cards** the deck serves (`deck-1..3`), each as a full screen and as the card alone with a transparent background (`card-1..3`). The cards alone are what fly off the screen in the swipe animation. It uses whatever the deck serves, without hunting for a flattering one.
4. **Makes a masked copy of each card.** It hides the share price and past-year move with CSS at capture time (the app code doesn't change), giving `deck-1-masked` and `card-1-masked`. Most ads use the masked copy, so a price that moves after the capture date doesn't date the ad, and the ad doesn't look like it's pushing a stock. G1 and E2 deliberately use the real, unedited card so at least one ad shows the app exactly as users see it.
5. **Opens the full story** (`details`) with its sources, then finds a card with a real P/E ratio for the `metrics` shot. Loss-making companies show a dash, so it skips ahead until one has a number.
6. **Captures the Likes screen** (`likes`).
7. **Captures the recap** ("What your likes say about you") from the dev-only lab route with sample likes. This step uses Chromium instead of WebKit, because headless WebKit flattens the recap's 3D orbit.
8. **Signs in as the test account and asks Ask AI a real question**: "What does a P/E ratio actually mean?" Gemini is sometimes busy on the free tier, so it retries up to three times, 20 seconds apart, and falls back to capturing the empty chat.

The shots land in `marketing/ads/shots/{light,dark}/`, which is gitignored, so they are recaptured whenever the ads are rebuilt. The capture never touches `marketing/app-store/` or `marketing/raw/`.

---

## 4. The concepts file

`marketing/ads/creatives/concepts.json` holds every word in every ad, and the scripts read from it. Changing an ad means changing this file and re-running the pipeline.

It has five sections:

- **`voices`**: ElevenLabs voice IDs. `british` is George, the voice the owner chose. `american` and `female` were the comparison voices in the first batch.
- **`cta`**: the closing line, `"Download Stock Matcher A.I. free on the App Store."` The odd spelling is for the voice (section 5); the screen shows "StockMatcherAI".
- **`bodies`**: the scenes after the hook, keyed by category (`g`, `e`, `m`) or by a specific body (`x2`). Each scene has:
  - `say`: what George says.
  - `head`: the heading on screen.
  - one of:
    - `anim`: the swipe-right or swipe-left animation.
    - `screen`: which capture to show.
    - `screen` plus `zoom`: a band of the screen enlarged so small text is readable on a phone.
- **`hooks`**: one entry per ad:
  - `id`, e.g. `x2-revenue`, and `cat`, which sets the colour theme.
  - `say`: the hook line.
  - `screen`: the capture behind the hook.
  - `still_screen`: the capture in the 9:16 image ad.
  - `benefit`: the one-line promise under the hook on image ads, also used in Meta's text.
  - optional:
    - `body`: use a body other than the category's.
    - `real`: show the unmasked card.
    - `disclaimer`: add "Educational only, not investment advice."
    - `opening`: the cold-open style (section 7).
    - `speed`: how fast George speaks.
    - `accent_from`: which word the hook's colour change starts on.
- **`first_batch`**: which ad and voice pairs `voiceover.mjs first` makes.

Example, the hook that started the x-series:

```json
{ "id": "x2-revenue", "cat": "g", "say": "It's Tinder, except the matches have revenue.",
  "screen": "deck-2-masked", "still_screen": "deck-2-masked",
  "benefit": "Swipe right on real companies working on causes you pick.",
  "body": "x2", "opening": "mid-swipe", "speed": 1.15, "accent_from": 2 }
```

---

## 5. The voiceover

`marketing/ads/scripts/voiceover.mjs` makes one MP3 per ad with ElevenLabs, plus a JSON file with the start and end time of every word. Those timings drive everything in the video: when each scene starts, when each caption word lights up, when each hook word appears.

```
FFMPEG=<path to ffmpeg> node --env-file=.env.local marketing/ads/scripts/voiceover.mjs x2-revenue british
```

How it works:

1. **Builds the script** by joining the hook, the body lines and the CTA into one passage, so George reads it as one natural take rather than stitched clips.
2. **Calls ElevenLabs text-to-speech with timestamps**:
   - Model: `eleven_v4`.
   - Voice settings: stability 0.5, similarity 0.75.
   - Speed: 1.15 for the cold-open ads, which need the hook to land faster.
   - Seed: fixed, so a re-run gives the same read.
3. **Turns the character timings into word timings** and checks that the words match the script exactly.
4. **Checks the app name.** Early on, "AI" in "StockMatcherAI" was read as "A" or "eye". Spelling it `Stock Matcher A.I.` fixed it, but there's a catch: transcribing the whole voiceover hides the problem, because speech-to-text guesses the right name from context. So the script cuts out only the clip between "Matcher" and "free", transcribes that clip on its own with ElevenLabs Scribe, and passes only if it hears "A I". If not, it regenerates with a new seed, up to three tries.
5. **Keeps existing files.** It never spends credits re-making a voiceover that already exists. Delete the `.json` to force a new one.

Output goes to `marketing/ads/creatives/vo/<id>-<voice>.mp3` and `.json`.

The key is `ELEVENLABS_API_KEY` in `.env.local`, loaded with `--env-file` and never printed or committed. Every voiceover spends ElevenLabs credits.

The name check is a machine check. A person should still listen to every finished ad, because nothing here can hear tone, pacing or an odd stress.

---

## 6. Rendering the videos

`marketing/ads/scripts/render_videos.py` draws every frame in Python with Pillow and pipes them into ffmpeg. There's no video editor and no template. That's what lets the swipe use the real card, the captions follow George word by word, and a whole batch of ads re-render in minutes after a copy change.

```
python marketing/ads/scripts/render_videos.py sheet x2-revenue-british    # review frames first
python marketing/ads/scripts/render_videos.py video x2-revenue-british    # then the video
```

### Format

- 1080×1920 (9:16), 30 frames per second, for Reels, Stories and Feed.
- H.264 at CRF 18 (high quality), AAC audio at 192 kbps, `faststart` so it plays before it fully downloads.
- Audio normalised to −16 LUFS, the usual loudness for social video, so it isn't quieter than the ads around it.
- The video runs 2.2 seconds past the last word, so the call to action stays on screen.

### The safe zone

Meta covers parts of a 9:16 video with the account name, caption, buttons and progress bar. All text stays inside:

- **Top:** below y = 269 (the top 14% is covered).
- **Bottom:** above y = 1248 (the bottom 35% is covered by the caption and buttons).
- **Sides:** 66 px in from each edge.

Only the phone is allowed to run below the safe zone, since a bit of phone hidden under the caption costs nothing.

### Colour themes

Each category has its own look, all from the app's plum and coral palette:

| Category | Background | Text | Accent | App shots |
|---|---|---|---|---|
| Gamified (`g`, and the x-series) | near-black plum | warm white | coral | dark mode |
| Educational (`e`) | warm white | plum-black | burnt orange | light mode |
| Values (`m`) | deep plum | warm white | coral | dark mode |

Each background has a soft glow at the top (a blurred ellipse) so it doesn't look flat. The font is Inter, included in `marketing/ads/fonts/` under its open font licence.

### The phone

The captures are bare screenshots, so the script builds a phone around them:

1. Adds an iOS status bar above the capture: a Dynamic Island, "9:41", signal bars and battery, in white or black depending on how dark the screen is.
2. Rounds the screen's corners and sets it into a black body with a thin grey edge.
3. Caches the result, so each phone is built once per render.

### Scenes and timing

The script splits the voiceover's words into scenes (hook, each body line, CTA) by counting the words in each line of the concepts file. Each scene starts at the exact moment George says its first word. Scenes cross-fade over 0.2 seconds, except the swipe scenes, which cut straight in so the swipe starts on the beat.

**Hook scene (standard ads)**
- The hook line appears word by word in large text (96 px, shrinking to fit three lines). Each word fades and rises into place as George says it.
- Words before the colour change are white and the rest are coral. For example, in "Everyone says 'just invest.' **Nobody explains in what.**" the second sentence is coral. By default the colour changes after the first full stop or question mark; `accent_from` overrides that.
- The phone rises in below the text with the hook's screen.

**Body scenes**
- **Swipe:** the card from the capture flies off the deck to the right (a like) or left (a pass), turning up to 16°, with the next card already showing underneath. The flying card is clipped to the phone's screen, as it would be on a real phone.
- **Zoom:** a band of the screen, such as the card's Proof and To Know boxes or the recap's insight, is cut out and enlarged to nearly full width, then grows slightly over half a second. This makes small app text readable on a phone.
- **Screen:** a full phone slides up with the screen, for Ask AI or Likes.
- Each scene has its heading at the top ("Know what you're swiping on", "Stuck? Ask AI").

**Captions**
- Every spoken word is on screen in a dark pill just above the bottom of the safe zone, a line at a time. The current word lights up in peach. Most people watch with the sound off, so the captions carry the message on their own.
- "A.I." is spoken but shown as "AI", and "P.E." as "P/E".

**Call to action**
- "StockMatcherAI" in large type.
- The AI line: "Matches built around your values, / with AI to explain every company."
- A coral button: "Download free on the App Store".
- On ads marked `disclaimer`, the disclaimer line sits under the button.

### Review frames

`sheet` mode renders one frame from each scene of each ad into a single contact sheet (`creatives/previews-videos.png`), without encoding any video. Every batch is checked here first, because it is much faster than watching full videos: text fit, the right screen in each scene, nothing outside the safe zone.

---

## 7. The cold-open format (the x-series)

The first ads open on the hook text with the phone rising in. That's clean, but the first frame is mostly still. On Reels and Stories people decide in about a second, so the x-series tries a different opening: **something is already moving on frame one.**

### What the owner approved: mid-swipe (x2)

- **A real hand holding the phone.** The phone is a photo of a hand, not a drawn phone, so it looks like someone's screen rather than an ad.
- **The swipe has already started on frame one.** The first card is about 30% of the way off the screen at t = 0 and finishes by 0.35 s. A second swipe runs from 1.0 to 1.45 s. So the viewer sees two swipes before the hook finishes.
- **The hand moves with each swipe.** It nudges up to 40 px sideways and 5° with each card, plus a slow, constant sway, so it never looks pasted on.
- **The hook is spoken from t = 0 at 1.15× speed**, so the line lands sooner.
- **The body is the same in all x-series ads.** Its scenes:
  1. "Swipe right on real companies working on causes you pick."
  2. "Every card shows what it does, the proof, and what to know."
  3. "Stuck on something? Ask A.I."
  4. "Then see what your likes say about you."

  The swipe and full-screen scenes use the hand too, at a larger size.

### What the owner rejected: phone pickup (x1)

x1 opened with the hand lifting the phone into frame from below. The owner's verdict was "never do that again", so `opening: "pickup"` is still in the code but must not be used.

### How the hand image was made

1. **Generated in Canva:** an AI image of a hand holding a phone with a bright green screen, on a plain white studio background.
2. **Exported at full size** through a Canva design. A generated image can only be downloaded at full resolution by putting it in a design and exporting that.
3. **Cut out with `marketing/ads/scripts/make_hand_asset.py`.** Canva's background remover needs a paid plan, so this script does the same job:
   - **Removes the green screen** by measuring how much greener than red or blue each pixel is, with soft edges so the thumb doesn't get a hard outline.
   - **Removes the white background**, but only the white that connects to the image's border. Highlights on the skin are also near-white and would otherwise be cut out.
   - **Removes the pale halo** around the hand by growing the background cut by 2 pixels.
   - **Removes green spill** from the thumb's edge.
   - **Saves `creatives/hand-phone.png`** with transparency and prints the screen's position, which `HAND_SCREEN` in `render_videos.py` uses.
4. **The real app screen goes behind the photo**, so the thumb sits on top of the app as it would in real life. The capture is shifted down 40 px to clear the photo's notch, and the phone turns around the wrist rather than its centre, as a real hand would.

### The x-series hooks

All x-series ads use the same body, so their results compare only the hooks.

| Ad | Hook | Category | Length |
|---|---|---|---|
| x2 | It's Tinder, except the matches have revenue. | gamified | 21.1 s |
| x3 | Finance bros made this sound hard on purpose. | anti-gatekeeping | 21.5 s |
| x4 | Nobody can tell you what the company they own actually makes. | anti-gatekeeping | 22.5 s |
| x5 | Spotify Wrapped, but for where your money could go. | seasonal (December) | 21.6 s |
| x6 | New year, new portfolio. Start with what you actually believe. | seasonal (December) | 23.0 s |
| x7 | You've been about to start investing for three years now. | callout | 21.6 s |
| x8 | Analysis paralysis isn't research. It's fear with a spreadsheet. | callout | 22.7 s |

Longer hooks cost time. x6 and x8 take 4.6–4.8 s to say, so after the second swipe ends at 1.45 s, the phone only sways while George finishes the line.

---

## 8. The image ads

Each hook also has two still images.

### 4:5 feed images (1080×1350), built in Canva

These are the ads people see in the Facebook and Instagram feeds.

1. **Upload the fresh captures to Canva.**
2. **Copy the owner's chosen template** (phone frame and background pattern) into a new design for each hook.
3. **Edit the design.** The layout, from top to bottom:
   - the hook, largest
   - one benefit line, on a coral accent bar
   - the phone with the real screen
   - the call to action

   The category colours match the videos (section 6).
4. **Check that every line fits.** M4's benefit, for example, overran its accent bar and was shortened to "Block what you won't back. See who works on your causes."
5. **Export as PNG** to `creatives/images/<id>-4x5.png`.

The designs stay editable in Canva, so a wording change doesn't mean rebuilding them.

### 9:16 images (1080×1920), drawn in code

These are used for Stories and Reels placements and as the cover image for each video ad.

```
python marketing/ads/scripts/render_videos.py stills x2-revenue x5-wrapped
```

They use the same layout as the 4:5 images (hook, benefit line, phone, "Download free on the App Store" button), drawn with the same fonts and colours as the videos and kept inside the same safe zone. Output goes to `creatives/images/<id>-9x16.png`.

### Disclaimers

"Educational only, not investment advice." is added only on E2, E4, M2 and M5, by the owner's choice: enough to show it's there, without making every ad read like a warning label. Real app screens still show the app's own line where the app has it.

---

## 9. Checks before anything ships

Every batch goes through these checks before it's handed over:

1. **Claims:** every number, cause name and feature in the script is checked against the current code and data (section 2).
2. **Review frames:** the contact sheet is checked for text fit, the right screen in each scene, and the safe zone.
3. **Name check:** `voiceover.mjs` must print `PASS` for every ad.
4. **Final-file frames:** frames are pulled from the finished MP4s, not the preview, at:
   - frame one, to confirm the cold open is already moving
   - each scene change
   - the call to action

   The file is also checked for an audio track and the expected length.
5. **Prices:** only G1 and E2 show a real share price. Any other ad showing one is a bug. E4's 9:16 image did once show a price through the details screen, and was switched to the masked card.
6. **Listening:** the scripts can't hear the audio, so a person listens to the final voice.

---

## 10. Putting the ads on Meta

### The campaign

`scripts/create-meta-campaigns.mjs` built the live campaign through Meta's Marketing API (v23.0). Run without `--apply`, it prints the plan and calls nothing.

**Objective:** Traffic. An App Installs campaign for iOS 15 needs Meta's SDK inside the app, which it doesn't have, so installs are counted in App Store Connect instead.

**Special ad category:** Financial products and services, US. This was declared after Meta rejected the P/E ad under that category. Declaring it fixes the age range at 18–65+.

**Ad sets:** three, one per category (Gamified, Educational, Values). Each has:
- $8.33 a day ($25 a day in total)
- US only, ages 18–65+
- Advantage+ audience
- mobile devices on iOS 15 or later
- Facebook, Instagram and Threads placements
- the verified advertiser identity attached

**Each ad has:**
- **Primary text:** the hook and the benefit line, e.g. "It's Tinder, except the matches have revenue. Swipe right on real companies working on causes you pick."
- **Headline:** "Download StockMatcherAI free".
- **Button:** Download. It goes to `https://www.stockmatcherai.com/download`, not straight to the App Store, because Meta rejects Traffic ads that link or redirect to the App Store. That page has one headline, one line about the app and an App Store button.
- **Video ads** also have the 9:16 still as their cover image.

Everything is created paused, and nothing spends until it's switched on.

**The ledger:** every ID Meta returns (campaign, ad sets, uploaded videos and images, creatives, ads) is saved to `marketing/ads/meta-created.json` as soon as it's created. If a run fails halfway, re-running continues instead of creating duplicates.

### Swapping ads

`scripts/meta-rotate-ads.mjs` replaces the weakest ads with new ones, one for one inside the same ad sets, so each ad set keeps three ads and its budget.

```
node --env-file=.env.local scripts/meta-rotate-ads.mjs create   # upload and create the new ads, paused
node --env-file=.env.local scripts/meta-rotate-ads.mjs swap     # new ones on, old ones paused
```

- **`create` runs ahead of time** so Meta can review the new ads before they're due to start.
- **`swap` turns the new ads on before pausing the old ones**, so an ad set is never left with fewer ads running if a call fails.
- **Both modes print every ad's status and any review feedback**, so a rejection shows up straight away.

The first swap ran at noon on 2026-11-06. It replaced G2, G3, E3, M1 and M3 (0–1 link clicks each) with x2, x5, x8, x6 and x7.

### The token

The scripts read `META_ACCESS_TOKEN` from `.env.local`. It is never printed, and errors have it scrubbed out.

Tokens from the Graph API Explorer expire within hours. To get one that lasts about 60 days:
1. Click the ⓘ next to the token.
2. Click **Open in Access Token Tool**.
3. Click **Extend Access Token**.

The current token lasts until 2027-01-05.

### Reading results

`spend` in Ads Manager's campaign table is the real number. The account's "amount spent" and the Billing page only go up when Meta actually charges the card, so they can show $0 while ads are spending.

---

## 11. What has worked so far

Results from 2026-11-05 to the morning of 2026-11-06, before the first swap:

| | |
|---|---|
| Spend | $41.85 |
| Impressions / people reached | 2,340 / 1,995 |
| Link clicks | 91 (3.9% click-through) |
| Cost per link click | $0.46 |
| Landing page views | 77 |

| Ad | Type | Spend | Link clicks | Click-through |
|---|---|---|---|---|
| G1 "It's like Tinder, but for stocks." | video | $13.53 | 34 | 5.2% |
| E1 "Everyone says 'just invest.' Nobody explains in what." | video | $12.18 | 28 | 4.7% |
| M2 "You'd donate to fight cancer…" | video | $11.94 | 21 | 3.1% |
| E2 "Nobody ever explained what a P/E ratio actually means." | image | $1.85 | 4 | 2.2% |
| G2, G3, E3, M1, M3 | images | under $1 each | 0–1 each | — |

What this says:

- **Video wins by a wide margin.** The three video ads took 90% of the spend and 83 of the 91 clicks. Meta's delivery strongly favours them, which is why the replacements are all videos.
- **The plainest hook is the best.** "Tinder, but for stocks" has the highest click-through and the cheapest clicks. Concrete comparisons beat clever lines.
- **Abstract hooks lose.** "Your money is already saying something" had the worst click-through of any ad that got real impressions.

---

## 12. Rules and lessons

### Meta's rules that matter here

- **Investment content.** In the US, Meta restricts ads that promote investment products or opportunities, *including educational content*, unless the advertiser is a verified brokerage or licensed advisor. Calling the app educational is no exemption from the rule. Hooks that talk about the viewer investing, such as x7, or about portfolios, such as x6, carry the most risk.
- **Personal attributes.** An ad can't assert or imply things about the viewer, such as their beliefs or financial situation, or imply it knows their finances. "You've been about to start investing for three years" is the closest the ads have come.
- **Destinations.** No links or redirects straight to the App Store from a Traffic ad. Use the `/download` page.
- **Brand names.** "Tinder" and "Spotify Wrapped" are used as names only: no logos, flames, green or Tinder styling. If Meta objects, x2 and G1 fall back to "Your next match has a ticker symbol."

### Production lessons

- **Show the app in the first second or two.** Every ad has the real app on screen almost immediately.
- **Solution-first bodies.** The owner found early bodies that described the problem again weak. The body should show the app doing the thing.
- **Same body, different hooks.** It's the only way to know what the hook did.
- **One voice.** George (British, deep and calm) on everything, for a consistent brand.
- **Fresh captures every time.** Never reuse `marketing/app-store/` screenshots; the app's design has changed since they were taken (cream to plum and coral on 2026-10-30).
- **Seasonal hooks wait for their season.** x5 and x6 are December hooks, running early by the owner's choice.

---

## 13. Commands

One-time setup (Python 3, any OS):

```
python3 -m venv ~/.venvs/ads && ~/.venvs/ads/bin/pip install -r marketing/ads/requirements.txt   # outside the repo
npm install    # includes @playwright/test and @elevenlabs/elevenlabs-js
```

A new batch, start to finish:

```
npm run dev                                                         # terminal 1
node scripts/capture-ad-shots.mjs                                   # terminal 2: fresh captures
# add hooks (and a body if needed) to marketing/ads/creatives/concepts.json
FFMPEG=$(~/.venvs/ads/bin/python -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())') \
  node --env-file=.env.local marketing/ads/scripts/voiceover.mjs <hook-id> british
~/.venvs/ads/bin/python marketing/ads/scripts/render_videos.py sheet <hook-id>-british
~/.venvs/ads/bin/python marketing/ads/scripts/render_videos.py video <hook-id>-british
~/.venvs/ads/bin/python marketing/ads/scripts/render_videos.py stills <hook-id>
# 4:5 image: copy the Canva template, edit, export to creatives/images/<hook-id>-4x5.png
```

Meta:

```
node --env-file=.env.local scripts/create-meta-campaigns.mjs           # print the plan
node --env-file=.env.local scripts/create-meta-campaigns.mjs --apply   # create, paused
node --env-file=.env.local scripts/meta-rotate-ads.mjs create          # new ads, paused
node --env-file=.env.local scripts/meta-rotate-ads.mjs swap            # switch them in
```

---

## 14. Where everything lives

| Path | What it is |
|---|---|
| `marketing/ads/creatives/concepts.json` | Every hook, body, voice and CTA |
| `marketing/ads/creatives/videos/` | Finished video ads, `<id>-<voice>.mp4` |
| `marketing/ads/creatives/images/` | Image ads, `<id>-4x5.png` (Canva) and `<id>-9x16.png` (code) |
| `marketing/ads/creatives/vo/` | Voiceovers and word timings |
| `marketing/ads/creatives/hand-phone.png` | The cut-out hand for cold opens |
| `marketing/ads/shots/` | App captures (gitignored, recaptured each batch) |
| `marketing/ads/fonts/Inter.ttf` | The font, with its licence |
| `marketing/ads/scripts/voiceover.mjs` | ElevenLabs voiceover and name check |
| `marketing/ads/scripts/render_videos.py` | Videos, review sheets, 9:16 images |
| `marketing/ads/scripts/make_hand_asset.py` | Cuts out the hand photo |
| `scripts/capture-ad-shots.mjs` | Captures the app |
| `scripts/create-meta-campaigns.mjs` | Builds the Meta campaign |
| `scripts/meta-rotate-ads.mjs` | Adds and swaps ads on Meta |
| `marketing/ads/meta-created.json` | Every Meta ID created |
| `src/pages/Download.tsx` | The `/download` landing page the ads link to |
| `marketing/ads/drafts/`, `vo2/`, `phones/` | The older cream-design drafts, kept for reference |
