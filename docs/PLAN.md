# ForgeLabs App Ad Studio: product plan

Approved by the owner on 2026-11-08. This file is the source of truth for what the product is and how it's built. Update it when a decision changes.

## What it is

**ForgeLabs App Ad Studio** makes hook-tested video and image ads for apps, from the app's real screens. A founder:
1. pastes their App Store or Google Play link (or sets the app up by hand), and the Studio brings
   in the name, icon and screenshots, writes five hooks and a script, and checks every claim
2. reviews the hooks, each with a claim badge and a live preview, and changes anything
3. generates, watches the progress, and downloads a ready-to-test pack

The pack contains:
- 3–5 vertical videos that share one body, each opening with a different hook, so a test
  compares only the hooks
- 9:16 and 4:5 images
- caption files
- ad copy
- a one-page test plan

It grew out of the ads made for StockMatcherAI. `docs/HOW-THE-ADS-ARE-MADE.md` is that case study, and `docs/AD-PLAYBOOK.md` is the general method the product follows.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Scope | **Creatives only.** No ad-platform management. Customers upload the pack to Meta, TikTok, YouTube or Snap themselves. | The creative is what makes the pipeline valuable, and it works on every platform. Managing customers' ad accounts means Meta App Review, budget liability and token upkeep. |
| First customers | App and software founders: iOS, Android, web apps and SaaS | The renderer, device frames and screen handling already fit apps. |
| Visuals in v1 | Uploaded screenshots and short screen recordings | Works for any app. Capturing from a URL is fragile and comes later, if at all. |
| Shape | Self-serve web app | |
| Name | "ForgeLabs App Ad Studio" on the existing domain, forgelaboratory.net | Keeps the ForgeLabs name; the descriptor says what it's for. The site was rebuilt for this product, replacing the lead-finding product. |
| Payments | **None in the MVP.** Each new account gets one free pack (3 to 5 videos); the owner can grant more in the database. Stripe comes after the MVP works. | The owner's call: MVP first. |
| Backend | A new Supabase project for the Studio (`cuijqoorjgvlyiyizgxi`, created 2026-11-08): Auth, Postgres, Storage, Edge Functions. Tables are prefixed `studio_`. | The owner chose a clean project on 2026-11-08, after the token they had reached a new account rather than the old ForgeLabs project (`xhtwtnsvdmabfvewjgwz`), which keeps serving the old product's opt-out pages. |
| Renderer | A Python worker (Pillow + ffmpeg), the generalized StockMatcherAI renderer. It polls a jobs table. It runs on the owner's Windows PC as a boot-time scheduled task (`engine/deploy/windows/`). A GCP server setup (`engine/deploy/gcp.sh`) exists; the server was deleted to save cost. The owner decided on 2026-11-27 to keep rendering on the PC; "Render capacity" below says how much it can take. | Renders take minutes of CPU, too long for edge functions. Edge functions allow 2 s of CPU per request and can't run Python or ffmpeg. |
| Hook writing and claim check | Claude (`claude-opus-5-5` by default, `STUDIO_AI_MODEL` overrides it) via the `studio-ai` Supabase Edge Function. It uses the official SDK, structured JSON output and the server-side refusal fallback (`fallbacks: "default"`). A deterministic "hook lint" in the browser works without AI. | **No Anthropic key yet** (2026-11-08). Until one is added, customers write hooks from patterns, checked by the lint. AI suggestions switch on when `ANTHROPIC_API_KEY` is set as a Supabase secret; the landing page's FAQ says they're being switched on during the beta. |
| Voice | ElevenLabs with word timestamps, plus a product-name pronunciation check. The MVP reuses the StockMatcherAI ElevenLabs key (owner approved). | Word timing drives the whole edit. |
| Repo | Public (GitHub Pages). The engine, prompts and docs are visible to anyone. | Pages on a free GitHub plan needs a public repo. Moving the engine to a private repo is an option before launch. |

## How it fits together

```
 browser (/app/, plain JS)                     Supabase (ForgeLabs project)
 ─────────────────────────                     ────────────────────────────
 sign in ─────────────────────────────────────► Auth
 brief, screens, hooks, script ───────────────► Postgres studio_* tables (row level security)
 uploads ─────────────────────────────────────► Storage studio-uploads/{user}/...
 "Suggest hooks" / "Check claims" ────────────► Edge Function studio-ai ──► Claude (when keyed)
 "Preview" / "Render" ────────────────────────► RPC studio_queue → studio_jobs (credit check)
                                                         │
                         Python worker (engine/worker.py) polls, claims a job,
                         downloads uploads, runs the engine:
                           preview: one frame per scene, no voice, seconds
                           render:  ElevenLabs voice + name check → videos,
                                    9:16 + 4:5 stills, .srt, ad copy, test plan, zip
                         uploads results ──────────────► Storage studio-renders/{user}/...
 download pack ◄────────────────────────────── signed URLs
```

## The engine (`engine/`)

The engine is ported from `marketing/ads/scripts/render_videos.py`, `voiceover.mjs` and `make_hand_asset.py` in the StockMatcherAI repo. It takes a **job JSON** instead of hard-coded paths:

| StockMatcherAI | Engine |
|---|---|
| `THEMES` per category | A theme from the customer's accent colour and light or dark style, with contrast checks |
| Captures without a status bar, plus a drawn status bar | Uploaded screenshots fitted to an iPhone-shaped screen; the drawn status bar is optional (on for captures without one) |
| Card swipe from card cutouts | Kept, and used by the golden test. Customers get a **page swipe** between two of their screens, which needs no cutouts. |
| None | **Screen recordings** play inside the phone |
| Hand cold open (`mid-swipe`) | Kept as the "hand" opening. The rejected `pickup` opening is gone. |
| Captions, safe zone, scene timing, end card, 9:16 still | Kept. The end card adds the app icon if uploaded. A 4:5 still is drawn in code, replacing the Canva step. |
| `voiceover.mjs` (Node SDK) | `voice.py` (REST): one take with timestamps, word check, fixed seed, and a name check generalized to any product name |

**Golden test:** `engine/tests/golden/` re-renders StockMatcherAI's approved x2 ad through the job JSON, using x2's original captures and voiceover (no voice credits spent), and compares frames with the shipped video.

## Data model (`supabase/migrations/`)

- **`studio_accounts`**: one row per user, created when they sign up. Holds `free_packs`, `packs_used` and `is_admin`.
- **`studio_projects`**: one per app. Holds the brief and brand as JSON.
- **`studio_assets`**: uploaded screens, recordings and the app icon. Each has a storage path, label, size and order.
- **`studio_hooks`**: holds:
  - the hook text and category
  - its source: `ai`, `template` or `user`
  - the check result
  - whether it's selected
- **`studio_batches`**: one test pack:
  - the full job spec
  - status
  - preview and result file lists
  - error
  - whether a pack was charged
- **`studio_jobs`**: the worker queue (`preview` or `render`). The worker claims jobs through `studio_claim_job()`, which uses `skip locked`.
- **Access rules:** row level security gives each user only their own rows and storage folder. Jobs are created only through `studio_queue()`, which checks:
  - the account has packs left
  - preview limits: 40 a day per user
  - only one open job per batch

## Status (2026-11-08)

| Part | State |
|---|---|
| Plan and docs | Done |
| Engine and golden test | Done. The x2 re-render is within 2 points of the shipped video (limit 4). |
| Voice | Works against ElevenLabs. One take per ad, with the name check reported. |
| Backend | Live on project `cuijqoorjgvlyiyizgxi`: migration applied, `studio-ai` deployed, storage buckets created. Sign-in sends people to forgelaboratory.net/app/ with a 10-character password minimum; email confirmation is on (see the open items). |
| App and landing page | Live on forgelaboratory.net |
| Sign-in emails | Sent through Google Workspace (smtp.gmail.com) as noreply@forgelaboratory.net, with branded templates, password reset and resend link. SPF, DKIM and DMARC (`p=none`, reports to noreply@) are set. Delivery was confirmed on 2026-11-09. Reapply with `supabase/auth-email.mjs`. |
| End-to-end test | **Passed on the live site** with `tests/live-flow.mjs`: sign-in, uploads, hooks, script, preview ready 16 s after queueing, pack 61 s after, and the zip downloaded with every file. |
| Worker | **Live on the owner's Windows PC** as the ForgeWorker scheduled task, which starts at boot and restarts the worker if it exits. End-to-end passed against it on 2026-11-09: preview in 13 s, a two-ad pack in 77 s. The GCP server was deleted to save about $50 a month; `engine/deploy/gcp.sh setup` recreates it. Renders only happen while the PC is on. |

**AI (2026-11-20):** `ANTHROPIC_API_KEY` is set as a Supabase secret and `studio-ai` was
redeployed; a live `suggest_hooks` call returned hooks in 18.5 s. `studio-store` is deployed (v2).
The worker's director and quality check need the key on the Windows PC too (see the open items).

**Launch prep (2026-11-27):**
- The README no longer shows the worker PC's local address, SSH user or host name. Older commits
  still contain them; the address is a home-network one, not reachable from the internet.
- Visit counting: `assets/visit.js` on every public page, `site_visit()` in
  `supabase/migrations/20261127120000_site.sql`, read with `supabase/launch-report.sql`.
  No cookies or pixels; the privacy page says what's counted. Sign-ups and packs are traced to the
  visitor's source within the same day.
- The queue: two open renders per account (`too_many_queued`), worker heartbeats in
  `studio_workers`, and `studio_queue_status()`, which the app uses to show the renders ahead,
  the expected wait, and that the renderer is off. `run-worker.cmd` starts three workers
  (`FORGE_WORKERS`), and the voice step retries ElevenLabs' 429 when they record at once.
  Until the migrations are applied, the app falls back to its old waiting message and visits
  aren't recorded.

**From the external review (2026-11-27):**
- The ads: the whole hook is on screen from frame one (`hook_reveal`), the scene going out of a
  transition no longer leaves its text over the new one, the end card holds 1.2 s after the last
  word instead of 2.2 s, a zoom over an empty stretch of screen moves to the content, tablet and
  desktop screenshots are shown whole on a blurred copy of themselves (the app marks them), and
  the end-card defaults no longer say "free". A one-hook pack gets a baseline test plan instead
  of the comparison plan.
- The quality check says when it didn't run, and why: in `quality-check.txt`, the manifest, a
  warning on the pack in the app, and an email to `ALERT_EMAIL`.
- Jobs: `studio_finish_job` takes `p_worker` and only finishes a job that worker still holds, the
  worker sends a heartbeat every 30 s whatever the engine is doing, and it retries reporting a
  result before giving up. Before this, a stalled job was already given up after three tries;
  that limit stays.
- Recordings are decoded once, as MP4 or MOV only, from local files only, with a time limit and a
  120 s cap. The encode has a timeout.
- AI calls have a ceiling of 2,000 a day across all accounts, on top of 60 per account. 2,000 is a
  placeholder; set it from the real cost per call.
- The site: `/pricing/` sends people to the pricing section, there's a branded `404.html`, the
  "Tell me when it's ready" link is now a waitlist form (`site_waitlist_join()`), and the hero
  draws about 30 frames a second, caps its pixel count, and holds a still frame if the GPU still
  can't keep up.
- Packs that are ready or failed are emailed to the customer once the worker has SMTP settings.
- Not done, and why: see "Decisions for the owner" below.

**The Studio flow (2026-11-27), from the owner's five changes:**
- **Paste the store link.** The apps page leads with the paste box, and a pasted link starts the
  import without a click (`runImport` in `assets/studio.js`): the listing, phone screenshots, the
  icon, a brand colour taken from the icon, then the hooks, their claim checks and the script.
  The import shows each step, and ends on the review step. "Set it up by hand" keeps the old form.
- **Five hooks, one per angle:** pain point, result, "watch this", comparison and social proof
  (`suggest_angles` in `studio-ai`). Social proof uses only the store's own rating and count
  (`studio-store` now returns them); without at least 50 ratings at 4.0 or better, that slot is
  written from another angle. The hooks that can pass come picked, one per angle, up to five.
  Each can be edited, rewritten by AI ("New idea"), or deleted, and people can write their own.
- **A claim badge and a live preview on every hook.** Passes, Check this, or Won't pass, from the
  AI check (which now sees the store listing and rating) and the browser's own check, and a
  one-click rewrite when the AI offers one. The preview types the picked hook over the app's
  first screen in a phone, laid out like the ad's first second.
- **Everything else is filled in** and shown as four chips: script, voice, colour and end card.
  Tapping one opens it. Headings, moves, the opening, effects, the ad headline and the
  disclaimer moved into Advanced. Without AI, the script comes from the listing's own feature
  lines (none with numbers).
- **Their own screens for the wait and the result.** A progress bar with the stages (waiting,
  screens, planning, voiceovers, checking, rendering video n of N, uploading) and the time left,
  then "Your ads are ready" with every video playable. Earlier renders sit below, each openable.
- **Each video has its own hook.** A pack needs three to five hooks, and no two can be the same
  (ignoring case, spacing and punctuation). The app enforces it, `studio_queue()` refuses
  `pack_needs_3_hooks` and `hooks_must_differ`, and the worker refuses both too. Previews can
  still use one hook. A video's 9:16 and 4:5 images carry that video's hook.
- `studio-ai` and `studio-store` changes need a redeploy. Until then the app uses the deployed
  `suggest_hooks` and maps its categories to the closest angles (problem to pain point, outcome to
  result, curiosity to "watch this"), so there's no social proof hook yet.
- Tested in Chrome against a fake backend (`tests/studio-flow.mjs`, `tests/auth-flow.mjs`), with
  the new studio-ai, the deployed one, and AI off, at desktop and phone width. On 2026-11-28
  `tests/live-flow.mjs` passed against the live site and backend: five AI hooks, a 13 s preview, and
  a 5-video pack (each video and its two images with their own hook) in 215 s. That pack was
  rendered by the PC's old worker (ae95d12), which wrote no quality check at all: the worker update
  below is still needed.

**Render capacity (measured 2026-11-27 on the render PC: Core i9-12900K, 16 threads, 64 GB).**
Each run rendered real packs from the golden test's recording, with typing and camera moves on:
20-second videos, their 9:16 and 4:5 images, captions and the zip. No voice or AI calls, so this is
the PC's own work. A video takes about 40 s on its own.

| Packs at once | Each 3-ad pack takes | 3-ad packs an hour | CPU average / peak | Memory |
|---|---|---|---|---|
| 1 | 2.0 min | 30 | 16% / 51% | 1.2 GB |
| 2 | 2.2 min | 55 | 26% / 60% | 2.4 GB |
| 3 | 2.4 min | 76 | 34% / 71% | 3.6 GB |
| 4 | 2.5 min | 95 | 44% / 78% | 4.9 GB |
| 6 | 2.9 min | 125 | 60% / 80% | 7.2 GB |
| 8 | 3.4 min | 141 | 72% / 81% | 9.7 GB |
| 10 | 4.2 min | 144 | 82% / 97% | 12.1 GB |
| 12 | 4.8 min | 149 | 82% / 98% | 14.3 GB |

- **The CPU is worth up to 8 at once.** Past 8 it's full: 10 or 12 at once add 2–6% more packs an
  hour while each one takes up to 40% longer. A 5-ad pack takes about 3.5 minutes alone.
- Memory isn't a limit: 1.2 GB a pack, 14 GB at 12 at once, of 64 GB.

**Real packs (measured 2026-11-28):** the worker's own path (`build_job`, the director, ElevenLabs
voiceovers with the name check, the quality check, the renders, the upload to storage) with real
Claude and ElevenLabs calls, for StockMatcherAI's screens and three different hooks. Only the
screen download was skipped (read from disk). The uploads went to `studio-renders/bench/` and were
deleted.

| Packs at once | Each 3-ad pack takes | 3-ad packs an hour | Voices stage | Finished |
|---|---|---|---|---|
| 1 | 2.4 min | 25 | 18 s | 1 of 1 |
| 3 | 2.7 min | 67 | 17 s | 3 of 3 |
| 6 | 2.8–3.5 min | about 110 if none failed | 16–62 s | 5 of 6 |

- A pack alone: 3 s screens, 5 s Claude directs, 18 s three voiceovers, 20 s Claude checks,
  88 s three videos, 10 s upload of 30 MB (Supabase storage takes about 3 MB/s from this PC, not
  the 10 MB/s a speed test shows). The app's progress bar uses these numbers (`stageSeconds` in
  `assets/studio.js`).
- **Six at once is too many on ElevenLabs Starter**, which records 3 at once (`eleven_v4`:
  Starter 3, Creator 5, Pro 10). With six, one pack's voices waited out 45 s of retries (the whole
  retry budget) and another failed when ElevenLabs dropped the connection, which `voice.post` didn't
  retry then (it does now, `tests/test_voice.py`). **The default is now 3 workers** (`FORGE_WORKERS`
  in `run-worker.cmd`): about 67 three-ad packs an hour. Raise it with the plan, up to 8.
- **The monthly credits are the real limit, not the PC.** ElevenLabs charged 355 credits a 3-ad pack
  (for 842 characters of script, name checks included), and Starter has 40,000 a month and can't
  be extended: about 110 three-ad packs a month (a 5-ad pack is about 590), which the PC renders in
  under 2 hours.
- **Claude costs about $0.05 a pack** (Sonnet 5.5: about 14,100 tokens in and 2,500 out over the
  director, the review and the recheck, at $2 and $10 a million), plus the app's hook and script
  calls when a project is set up.

**Decisions for the owner (from the review):**
- **Rendering stays on the PC** (decided 2026-11-27). Still open: running the task as a
  low-privilege account instead of SYSTEM, which changes where the service-role key lives.
- **Billing and real prices.** No Stripe key exists for the Studio.
- **Sign-up without a password:** magic links need only an app change and an email template;
  Google sign-in needs a Google OAuth client the owner creates. A public "check your hook" box
  on the home page would let people try something before signing up.
- **Three to five hooks:** decided 2026-11-27. A pack needs three to five different hooks.
- **Music** needs a licensed library. **Store badges** need Apple's and Google's artwork, used
  under their guidelines.
- **The claim check on the server:** today the app runs it and the terms make customers
  responsible for their claims. Enforcing it on the server means moving the hook lint into the
  worker. It protects the customer from themselves, not the system, so it waits.
- **Sign-up abuse:** Supabase already rate-limits sign-ups per IP and email confirmation is on.
  A CAPTCHA (Turnstile or hCaptcha) needs an account. `site_visit()` can be called by anyone, like
  any page counter; it stops counting one visitor after 200 an hour.
- **Captions** break at punctuation or at about 860 px. Breaking at phrase boundaries would
  change every ad's captions, so it needs a look at real packs first.

**Open items for the owner:**
- Done 2026-11-28: both migrations applied to the live project (each in one transaction, after
  checking the live tables and function signatures against them), and `studio-ai` (version 7)
  and `studio-store` (version 4) redeployed through the Management API. Checked live: the store
  import returns the rating, `suggest_angles` writes five hooks, `check_hooks` answers,
  `site_visit` records a visit, and `studio_queue_status` refuses anonymous callers.
- **The worker PC:** pull the repo, add `ANTHROPIC_API_KEY` to `C:\forge\forgelabs-site\.env.local`,
  run `pip install -r engine\requirements.txt` in the venv (it now needs `anthropic`), and
  restart the ForgeWorker task, which now starts three workers. Stop the task before pulling (see
  README.md). Check three `polling` lines appear across `C:\forge\worker*.log`. Then run
  `tests/live-flow.mjs` and check the pack has `quality-check.txt`.
- **ElevenLabs plan:** Starter (3 voices at once, 40,000 credits a month, about 110 three-ad packs).
  A bigger plan raises both; then raise `FORGE_WORKERS` to match.
- **Email from the worker:** add `SMTP_USER`, `SMTP_PASSWORD` (a Google Workspace app password for
  noreply@forgelaboratory.net) and `ALERT_EMAIL` to the PC's `.env.local`, then restart the task.
- **Third-party terms:** ElevenLabs' commercial terms and the licence of the Canva hand photo.

## MVP build order

1. Repo setup, plan and docs (this file).
2. Engine port and golden test.
3. Supabase migration, storage buckets and the `studio-ai` function. These need the owner's `SUPABASE_ACCESS_TOKEN` in `.env.local`.
4. Worker: claim, preview, render, upload.
5. App: sign in, apps, brief, screens, hooks (templates + lint, and AI when keyed), script and style, preview, render, download.
6. Landing page, terms and privacy for the new product. `/remove/` and `/unsubscribe/` stay live for the old lead product's opt-outs.
7. End-to-end test against the real backend, then hand over.

**After the MVP:**
- Stripe subscriptions and credit tiers. Measure the real cost per video before setting limits.
- A hosted worker.
- The Anthropic key.
- Uploading a results CSV to get the next round of hooks.

## Legal and launch notes

- **Terms:**
  - customers confirm they have rights to their uploads and that their claims are true
  - customers own the outputs
  - no guarantee of ad approval or performance
  - AI voices are disclosed
- **Third-party terms:**
  - check that ElevenLabs' commercial and API terms cover generating voiceovers for customers on the plan in use
  - check the licence of the hand photo (generated in Canva) before charging for the hand opening
  - Inter is licensed under the OFL
- **Keys:** server side only. The anon key in the browser is public by design; row level security protects data.

## Verification

1. The golden test passes.
2. The engine renders fixture apps: a screenshot-only app and one with a screen recording.
3. The hook lint flags known false or risky claims:
   - a number not in the facts
   - "sees your bank balance"
   - personal-attribute wording
4. Against the real backend, a Playwright run covers sign-up → app → uploads → hooks → preview → render → download.
5. Frames, audio and length are checked from the downloaded files.
