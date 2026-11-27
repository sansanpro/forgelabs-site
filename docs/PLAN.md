# ForgeLabs App Ad Studio: product plan

Approved by the owner on 2026-11-08. This file is the source of truth for what the product is and how it's built. Update it when a decision changes.

## What it is

**ForgeLabs App Ad Studio** makes hook-tested video and image ads for apps, from the app's real screens. A founder:
1. describes their app
2. uploads screenshots or a short screen recording
3. picks hooks that passed a claim check
4. reviews the frames
5. downloads a ready-to-test pack

The pack contains:
- 3–5 vertical videos that share one body, so a test compares only the hooks
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
| Payments | **None in the MVP.** Each new account gets one free pack (up to 5 videos); the owner can grant more in the database. Stripe comes after the MVP works. | The owner's call: MVP first. |
| Backend | A new Supabase project for the Studio (`cuijqoorjgvlyiyizgxi`, created 2026-11-08): Auth, Postgres, Storage, Edge Functions. Tables are prefixed `studio_`. | The owner chose a clean project on 2026-11-08, after the token they had reached a new account rather than the old ForgeLabs project (`xhtwtnsvdmabfvewjgwz`), which keeps serving the old product's opt-out pages. |
| Renderer | A Python worker (Pillow + ffmpeg), the generalized StockMatcherAI renderer. It polls a jobs table. It runs on the owner's Windows PC as a boot-time scheduled task (`engine/deploy/windows/`). A GCP server setup (`engine/deploy/gcp.sh`) exists; the server was deleted to save cost. | Renders take minutes of CPU, too long for edge functions. Edge functions allow 2 s of CPU per request and can't run Python or ffmpeg. |
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

**Decisions for the owner (from the review):**
- **Leave the home PC:** a hosted worker costs about $50 a month (`engine/deploy/gcp.sh`).
  Staying on the PC, the next step is running the task as a low-privilege account instead of
  SYSTEM. Both change where the service-role key lives, so neither was done without a decision.
- **Billing and real prices.** No Stripe key exists for the Studio.
- **Sign-up without a password:** magic links need only an app change and an email template;
  Google sign-in needs a Google OAuth client the owner creates. A public "check your hook" box
  on the home page would let people try something before signing up.
- **Three to five hooks required?** The plan says a pack is 3–5 videos, but the app allows one.
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
- **Apply the migrations:** run `supabase/migrations/20261108120000_studio.sql` and then
  `20261127120000_site.sql` in the Studio project's SQL editor (both are safe to run again).
  Neither has been run against a database yet: they pass Postgres's parser, nothing more.
- **The worker PC:** pull the repo, add `ANTHROPIC_API_KEY` to `C:\forge\forgelabs-site\.env.local`,
  run `pip install -r engine\requirements.txt` in the venv (it now needs `anthropic`), and
  restart the ForgeWorker task, which now starts three workers. Check three `polling` lines
  appear across `C:\forge\worker*.log`. Then run `tests/live-flow.mjs` and check the pack has
  `quality-check.txt`.
- **ElevenLabs plan:** three workers can record at once. On a plan that allows fewer concurrent
  requests, a worker that's turned away retries for about 45 seconds, then the pack fails and is
  refunded. If that shows up in the logs, set `FORGE_WORKERS` to the plan's limit.
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
