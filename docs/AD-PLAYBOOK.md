# The ad creative playbook

A repeatable process for making short video and image ads for any product, service or piece of software, and for running them as a fair test on a paid social platform. It's the general form of the process in `HOW-THE-ADS-ARE-MADE.md`, which shows every step applied to one real app.

The process rests on four ideas:

1. **The hook does most of the work.** Most viewers decide within a second or two whether to keep watching. Spend most of the effort there.
2. **Show the real thing.** Real product, real screens, real customers. Never a mock-up that promises more than the product delivers.
3. **Change one thing at a time.** Ads in a test share everything except the hook, so the results tell you which hook won.
4. **Automate the build.** When every word lives in one file and the ads are rendered from it, a new hook costs minutes, not a day in an editor.

## Contents

1. [Before you start](#1-before-you-start)
2. [Write the hooks](#2-write-the-hooks)
3. [Write the body and call to action](#3-write-the-body-and-call-to-action)
4. [Capture the real product](#4-capture-the-real-product)
5. [Keep every word in one file](#5-keep-every-word-in-one-file)
6. [Make the voiceover](#6-make-the-voiceover)
7. [Build the video](#7-build-the-video)
8. [Open with motion](#8-open-with-motion)
9. [Build the image ads](#9-build-the-image-ads)
10. [Check before anything ships](#10-check-before-anything-ships)
11. [Launch on the ad platform](#11-launch-on-the-ad-platform)
12. [Run the test and read the results](#12-run-the-test-and-read-the-results)
13. [Rotate and iterate](#13-rotate-and-iterate)
14. [Templates](#14-templates)

---

## 1. Before you start

Write down the answers to these. Every later step depends on them.

| Question | Why it matters |
|---|---|
| What does the product actually do, in one plain sentence? | Every hook and body line must stay true to this. |
| Who is it for, and what problem do they feel? | Hooks either name the problem or show the product. |
| What is the one action you want after the ad? | Install, sign up, book, buy. The call to action and campaign objective follow from it. |
| What can the product *not* do or see? | This is where false claims come from. Write it down so no hook implies it. |
| Is the product in a regulated or sensitive category? | Finance, health, housing, employment, credit, politics, alcohol, gambling, dating, weight loss and others have extra ad rules. Read the platform's policy for the category before writing anything. |
| What facts and numbers can you prove? | Prices, counts, results, ratings. Only these may appear in ads. |
| What brand look do the ads use? | Colours, font and tone, taken from the product itself so the ad and the product feel like one thing. |

---

## 2. Write the hooks

The hook is the first line: spoken, on screen, or both. It has one job, which is to make the right person stop scrolling.

### The clarity test

A hook passes if a stranger can **picture the product, or feel the problem, within about two seconds** of hearing it. Clever, abstract or poetic lines usually fail this test even when they sound good in a meeting.

The strongest pattern is the **familiar comparison**: "X, but for Y". "It's like Tinder, but for stocks" explains a whole product in five words because the viewer already knows how Tinder works.

### Hook categories

Write several hooks in each of a few categories, then test the best of each. Useful categories for most products:

| Category | What it does | Pattern |
|---|---|---|
| **Comparison** | Explains the product by something familiar | "It's [known thing], but for [your thing]." |
| **Problem** | Names a frustration the viewer already has | "Everyone says [advice]. Nobody explains [the hard part]." |
| **Outcome** | Shows the result the viewer wants | "[Result] without [usual pain]." |
| **Anti-gatekeeping** | Says the field was made hard on purpose | "[Experts] made this sound hard on purpose." |
| **Callout** | Describes the viewer's own behaviour back to them | "You've been about to start [thing] for [time] now." |
| **Values or identity** | Ties the product to what the viewer cares about | "You'd [do good thing]. Could you name one [way your product helps]?" |
| **Seasonal** | Rides a moment in the calendar | "New year, new [thing]." Only run it in season. |
| **Curiosity** | Opens a question the ad answers | "Nobody ever explained what [jargon] actually means." |

### Rules for every hook

1. **Every claim is checked against the product.** Every number, feature and result the hook mentions must be true today. Keep a list of hooks you ruled out and why, so nobody writes them again.
2. **Never imply the product knows something it doesn't.** "Where your money's been going" implies access to someone's finances. "Your health data shows…" implies access to their records. If the product can't see it, the hook can't say it.
3. **Be careful about the viewer.** Platforms restrict ads that assert or imply personal attributes, such as health, finances, beliefs, age or sexuality. "Are you struggling with debt?" is a classic rejection. Describe the situation, not the person.
4. **Use other brands' names only as a comparison.** No logos, colours or styling, and have a fallback hook ready in case the platform objects.
5. **One idea per hook.** If it needs a second sentence to make sense, it's two hooks.
6. **Short enough to say in about three seconds.** Longer hooks hold the viewer on a static opening and lose people.

### When someone gives you a hook list

Use their top-ranked hooks in each category, as written. Change wording only where a claim would be false, and say exactly what you changed and why. Don't swap in your own favourites.

---

## 3. Write the body and call to action

### The body: show, don't repeat

The body follows the hook and shows the product solving the problem the hook raised. It should be **solution-first**: the moment the hook ends, the viewer sees the product working.

- 3–5 short lines, each paired with one shot of the product doing that thing.
- Concrete features, not adjectives: "Every card shows what it does, the proof, and what to know" beats "Smart, simple and powerful."
- End on the most satisfying moment: the result, the reveal, the finished thing.

**All hooks in one test share one body.** That's what makes the test fair.

### The call to action

- Say exactly what to do and where: "Download [name] free on the App Store", "Book your first session at [site]".
- Put it on screen as a button **and** say it.
- Keep it on screen for 2 seconds after the voice ends.
- If price is a barrier and the product is free to start, say "free".

### Disclaimers

Add a disclaimer where the category or the claim needs one ("Not medical advice", "Results vary", "Educational only"). Use it on as few ads as the rules allow, so the ads don't read like warning labels. Check the platform's category policy to see where it's required.

### Length

Most short-form ads land at **15–25 seconds**: 2–4 s of hook, 10–15 s of body and 3–4 s of call to action.

---

## 4. Capture the real product

Everything the viewer sees should be the real product as it is today.

| Product type | How to capture it |
|---|---|
| **Web or mobile app** | Drive the real app with a browser automation tool such as Playwright, at real phone size and pixel density, as a brand-new user. Save full screens and individual elements, such as a card or a button, with transparent backgrounds for animation. |
| **Desktop software** | Scripted screen recordings or screenshots at a fixed window size, with sample data. |
| **Physical product** | Photos and short clips on a plain background, plus a few in real use. Shoot vertical (9:16). |
| **Service** | Footage of the service being delivered, the result, and real customers if they consent. Screens from any booking or tracking tool. |

Rules for captures:

1. **Script the capture so it can be repeated.** When the product changes, run it again rather than reusing old images. Old screenshots go out of date fast.
2. **Use a clean test account or sample data**, marked so your analytics ignore it.
3. **Hide anything that dates the ad or creates risk**, such as prices that change, real customer names or live numbers. Do it at capture time, without changing the product. Keep one ad showing the real, unedited screen so you can see the product exactly as users do.
4. **Capture in both light and dark mode** if the product has both, and choose per ad.
5. **Don't cherry-pick.** Show what a normal user would see, not the single best result the product ever produced.
6. **Use real AI answers.** If the product has AI features, ask a real question and capture the real answer, retrying if the service is busy.

---

## 5. Keep every word in one file

Put every hook, body line, call to action and setting in one data file, such as `concepts.json`, and have the scripts read from it. Changing an ad means editing this file and re-running the scripts.

A workable structure:

```json
{
  "voices": { "main": "<voice id>" },
  "cta": "Download Acme free on the App Store.",
  "bodies": {
    "main": [
      { "say": "Line the voice says.", "head": "Heading on screen", "shot": "screen-name" },
      { "say": "Next line.", "head": "Next heading", "anim": "swipe-right" },
      { "say": "A detail worth zooming into.", "head": "Heading", "shot": "screen-name", "zoom": [0.0, 0.37, 1.0, 0.72] }
    ]
  },
  "hooks": [
    { "id": "h1-comparison", "category": "comparison", "say": "It's like X, but for Y.",
      "shot": "screen-name", "benefit": "One-line promise for image ads.", "body": "main" }
  ]
}
```

Optional per-hook fields that pay off:

- `disclaimer`: true for ads that need one.
- `speed`: voice speed, e.g. 1.15 for a faster hook.
- `opening`: the cold-open style (section 8).
- `accent_from`: which word starts the highlight colour.
- `real`: use the unedited capture instead of the masked one.

Name ads `<id>-<voice>`, e.g. `h1-comparison-main.mp4`, so files, platform ad names and results all match.

---

## 6. Make the voiceover

A voiceover makes the ad feel finished, and its word timings can drive the whole edit.

1. **Pick one voice and keep it for every ad.** It becomes part of the brand. Compare 2–3 voices on the first batch, then commit.
2. **Generate the whole script in one take:** hook, body and call to action together, so the read sounds natural rather than stitched.
3. **Request word-level timestamps.** Most text-to-speech APIs, such as ElevenLabs, return character or word timings. Save them next to the audio. Every scene change, caption word and on-screen word can then line up to the voice exactly.
4. **Fix the seed and settings** so a re-run gives the same read.
5. **Check how the product name is pronounced on its own.** Speech-to-text "corrects" a misread name from context, so transcribing the whole voiceover hides the error. Instead:
   - Cut out just the clip of the name, using the word timings.
   - Transcribe that clip alone.
   - Regenerate if it's wrong.
   - If the name keeps coming out wrong, respell it for the voice, e.g. "A.I." for "AI", and show the real spelling on screen.
6. **Don't regenerate what exists.** Voiceovers cost credits, so skip any that are already made.
7. **A person listens to every final ad.** Machine checks can't judge tone, pacing or an odd stress.

Keep API keys in an untracked environment file, never in code, chat or the repository.

---

## 7. Build the video

### Two ways to build

| Approach | Good for | Trade-off |
|---|---|---|
| **Code-rendered**: draw each frame in code (e.g. Python with Pillow) and pipe the frames to ffmpeg | Many variants, exact timing to the voice, real product elements animated, re-rendering a whole batch after a copy change | More setup up front |
| **Editor or template**: Canva, CapCut, Premiere, After Effects | A handful of ads, footage-heavy services and physical products | Every variant is manual work |

For software, code rendering pays off quickly. For physical products and services with lots of live footage, an editor is often simpler. Either way, follow the rules below.

### Format

- **9:16, 1080×1920**, for Reels, Stories, Shorts and TikTok. Most platforms also accept it in the feed.
- 30 frames per second, H.264, high quality (e.g. CRF 18), AAC audio, with the `faststart` flag so it plays before it fully downloads.
- **Normalise loudness** to about −16 LUFS so the ad isn't quieter than what's around it.

### The safe zone

Each platform covers parts of a 9:16 video with its own interface: account name, caption, buttons and progress bar. **Keep all text and anything important inside the safe zone.** As a starting point (check each platform's current spec):

- top 14% covered
- bottom 35% covered
- 6% in from each side

Only decorative or non-essential parts, such as the bottom of a phone, may run outside it.

### Structure

| Scene | What's on screen |
|---|---|
| **Hook** | The hook text, large, each word appearing as it's spoken. Part of it in an accent colour for emphasis. The product visible from the first second. |
| **Body**, one scene per line | A heading at the top and the product doing the thing the line describes: an animation of the real element (a swipe, a tap, a result appearing), a zoom into a detail, or a full screen. |
| **Call to action** | Product name, one supporting line, the button. The disclaimer, if any. |

### Details that make ads look professional

- **Start each scene on the word that begins it**, using the voice timings. Short cross-fades (about 0.2 s) between scenes, but cut straight into motion scenes so the motion starts on the beat.
- **Captions on every spoken word**, in a readable pill inside the safe zone, with the current word highlighted. Most people watch with the sound off, so the captions must carry the message alone.
- **Show what's spoken in its natural written form.** If the voice needed "A.I." to pronounce it, the screen still shows "AI".
- **Zoom into small text.** Product screens shown at full size on a phone are unreadable. Crop the important band and enlarge it.
- **Put screens in a device frame.** A phone, laptop or tablet frame with a realistic status bar makes a bare screenshot read as a real product.
- **Use the product's colours and font.** Pick a theme per hook category for variety within one brand. Check the font's licence for commercial use.
- **Hold the end card** for about 2 seconds after the last word.

### Review frames before rendering

Render one frame from every scene of every ad into a single contact sheet before encoding any video. Check text fit, the right shot in each scene and the safe zone there. It's much faster than watching full videos.

---

## 8. Open with motion

Viewers decide in about a second, so **frame one should already be moving.** A still title card, or a phone sliding in from nothing, wastes that second.

What has worked:

- **The action is already happening on frame one.** For an app, a card is already part-way through a swipe. For a product, the lid is already opening or the pour has already started. For a service, the result is already being revealed.
- **A real hand holding the product.** A hand makes it read as someone's real phone or real object rather than an ad. For software:
  1. Generate or shoot a photo of a hand holding a phone with a green screen, on a plain background.
  2. Key out the green and the background. Most image tools, or a short script, can do this.
  3. Put the real product screen behind the photo, so the thumb sits on top of it.
  4. Animate small movements with each interaction, plus a slow sway, and pivot from the wrist, so it never looks pasted on.
- **Two actions before the hook ends**, e.g. one swipe at 0 s and another at about 1 s.
- **Faster voice on the hook** (about 1.1–1.2×), so the line lands sooner.

What hasn't worked:

- A slow lead-in that delays the product, such as the phone being lifted into frame. The viewer sees nothing useful for the first second.

**Keep hooks short in this format.** If the hook runs longer than the opening motion, the screen goes static while the voice finishes.

---

## 9. Build the image ads

Make each hook as a still too: images reach placements video doesn't, and they're cheap to test.

| Size | Use |
|---|---|
| **4:5, 1080×1350** | Feeds |
| **9:16, 1080×1920** | Stories and Reels placements, and as the video's cover image |
| **1:1, 1080×1080** | Optional, for placements that need it |

Layout, top to bottom:

1. **The hook**, largest text, in the same words as the video.
2. **One benefit line**, smaller, in the accent colour.
3. **The real product**, in its device frame, or a photo of the product or service.
4. **The call-to-action button.**

Build 4:5 images as editable designs in a design tool such as Canva: copy one template per hook, edit the text, check every line fits, then export PNG. Draw the 9:16 images in the same code as the videos, so they match exactly. Keep text inside the 9:16 safe zone.

---

## 10. Check before anything ships

Run every batch through this list.

1. **Claims:** every number, feature, result and comparison is true today, checked against the product, not memory.
2. **What the product can't do:** no hook or line implies it, or that the product knows things about the viewer.
3. **Platform policy:** for the product's category and for personal attributes. Fix or drop anything likely to be rejected before it's submitted.
4. **Review frames:** text fit, the right shot per scene, the safe zone.
5. **Final files:** frames pulled from the finished videos, not the preview:
   - frame one, to confirm it moves
   - each scene change
   - the call to action

   Also confirm each file has an audio track and the expected length.
6. **Sensitive details:** no real customer data, no stale prices or numbers, and no unedited screen except where you meant to show one.
7. **Pronunciation check:** passed for every ad.
8. **A person watches and listens** to every final ad with sound on, then again with sound off.
9. **Landing page:** the link works, the page matches the ad's promise, and it loads fast on a phone.

---

## 11. Launch on the ad platform

These steps use Meta's terms; TikTok, Google and Snap have equivalents.

### Choose the objective

| Goal | Objective | Note |
|---|---|---|
| App installs | App promotion | Usually needs the platform's SDK or a measurement partner in the app. Without it, use Traffic and count installs in the app store's own analytics. |
| Sign-ups or purchases on a site | Sales or leads | Needs the platform's pixel or conversions API on the site. |
| Visits | Traffic | Easiest to set up. Optimise for landing page views rather than raw clicks if you can. |

### Set up the account properly

- **Declare any special ad category** your product falls into (finance, credit, housing, employment, social issues). It's a legal requirement, it limits targeting such as age ranges, and leaving it off gets ads rejected.
- **Verify the business and the advertiser identity** where the platform asks. Some categories need it before ads can run.
- **Link to a page you control**, not straight to an app store. Many platforms reject Traffic ads that link or redirect straight to a store. A one-screen landing page works: one headline that matches the ads, one line about the product, a button to the store or sign-up, and links to the terms and privacy pages.

### Structure

- **One campaign, one ad set per hook category**, each with its own equal daily budget, so every category gets spend.
- **Same targeting in every ad set**, so only the creative differs. Broad targeting usually works best on modern platforms; let the algorithm find the audience.
- **Two to four ads per ad set.** More than that splits the budget too thin.
- **Every ad has:**
  - primary text: the hook plus the benefit line, in the ad's own words
  - a short headline: the action, e.g. "Download Acme free"
  - the call-to-action button
  - for video ads, the 9:16 still as the cover image

### Create everything with a script

Use the platform's API (Meta's Marketing API, for example) rather than clicking through Ads Manager:

1. **Create everything paused.** Nothing spends until someone turns it on.
2. **Save every ID the moment it's created** to a ledger file (campaign, ad sets, uploaded media, creatives, ads). If a run fails halfway, re-running continues instead of creating duplicates.
3. **Read back what the platform stored** (targeting, budget, status, issues) and compare it with what you sent. Platforms sometimes quietly change settings.
4. **Have a dry-run mode** that prints the plan and calls nothing.
5. **Keep the access token in an untracked environment file.** Never print it or commit it, and scrub it from error messages. Use a long-lived token: short-lived ones expire within hours and break scheduled jobs.

### Review

New ads go through the platform's review, typically minutes to a day. Create new ads paused the day before you need them, so review is done by launch time. If an ad is rejected:

1. Read the exact reason.
2. Fix the ad, or the account setup such as a missing category declaration.
3. Appeal only when you're confident the ad complies.

---

## 12. Run the test and read the results

### The protocol

1. **Test 3–5 hooks at a time**, all sharing the same body, format and targeting.
2. **Give each enough impressions to judge.** About 1,000 impressions per ad is a sensible minimum before calling a winner on click-through. More is needed to judge downstream results such as installs or purchases.
3. **Don't touch the test while it runs.** Every edit can reset the platform's learning.
4. **Expect the platform to pick favourites.** It shifts budget to ads that do well early, so some ads get very little spend. An ad starved of impressions hasn't lost; it hasn't been tested. If a new ad needs a fair chance, put it in its own ad set with its own budget.

### What to look at

| Metric | What it tells you |
|---|---|
| **Click-through rate (link clicks ÷ impressions)** | Whether the hook and creative make people act. The main measure for comparing hooks. |
| **Cost per link click** | What the attention costs. |
| **Landing page views ÷ link clicks** | Whether people who click actually arrive. A big drop means a slow or broken page. |
| **3-second video views, or hook rate** | Whether the opening stops the scroll. |
| **Conversions** (installs, sign-ups, purchases) | The real goal. Read it from the store's or site's own analytics if the platform can't see it. |

Compare ads against each other and against your own earlier results, not against generic industry averages.

### Reading spend correctly

The campaign table's "amount spent" is the real figure. Billing pages and account totals often only update when the card is charged, so they can show nothing while ads are spending. Platforms also overspend the daily budget on some days and balance it out over the week.

---

## 13. Rotate and iterate

1. **Pause the weakest ads**, those with the lowest click-through after enough impressions, and replace them with new hooks.
2. **Swap one for one inside the same ad sets**, so each ad set keeps the same number of ads and the same budget.
3. **Turn the new ads on before pausing the old ones**, so an ad set never has fewer ads running.
4. **Create the replacements ahead of time**, paused, so review is finished when the swap is due.
5. **Schedule the swap with something that runs on its own**, such as a server cron job or a cloud scheduler, not something that depends on a laptop or chat session staying open.
6. **Write down what you learned** after each round: which categories win, which patterns lose, which hooks were rejected and why. The next batch starts from there.
7. **Refresh creative before it wears out.** When click-through on a winner falls steadily week over week, people have seen it too often. Make new variants of the winning pattern rather than starting over.

Patterns that tend to hold across products:

- Video usually gets most of the spend and most of the clicks.
- The plainest, most concrete hook usually beats the cleverest one.
- Abstract or poetic hooks usually lose.
- Showing the product in the first second beats building up to it.

---

## 14. Templates

### Hook brief

```
Product, in one sentence:
Who it's for, and the problem they feel:
The one action after the ad:
What the product can't do or see:
Regulated category? Which policy applies:
Provable facts and numbers:

Category: ____________
  1. Hook:                         Claim check:
  2. Hook:                         Claim check:
  3. Hook:                         Claim check:

Ruled out (and why):
```

### Ad script

```
ID:            h1-comparison
Hook (2–4 s):  It's like X, but for Y.
Body (10–15 s):
  1. [line]  →  shot: [screen or footage]
  2. [line]  →  shot: [screen or footage]
  3. [line]  →  shot: [screen or footage]
  4. [line]  →  shot: [the payoff moment]
CTA (3–4 s):   Download [name] free on [store].   Button: Download free
Disclaimer:    yes / no
Opening:       mid-action / standard
```

### Launch checklist

```
[ ] Special ad category declared, if any
[ ] Business and advertiser verified, if required
[ ] Landing page live, matches the ads, fast on a phone
[ ] Conversion tracking set up, or a plan to read results from the store or site
[ ] One ad set per category, equal budgets, same targeting
[ ] Everything created paused, IDs saved, settings read back
[ ] All ads passed review
[ ] Long-lived token in an untracked file
[ ] Test plan written: hooks, impressions per ad, end date
```

### Results log

```
Round:      Dates:        Budget:
| Ad | Hook | Impr. | Link clicks | CTR | Cost/click | Conversions | Verdict |
What won, and why we think so:
What lost:
What was rejected, and why:
Next round:
```
