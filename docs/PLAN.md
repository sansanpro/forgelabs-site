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
| Renderer | A Python worker (Pillow + ffmpeg), the generalized StockMatcherAI renderer. It polls a jobs table. It runs on an always-on Compute Engine server (e2-standard-2) in the owner's GCP project, paid from GCP credits; `engine/deploy/gcp.sh` deploys it. | Renders take minutes of CPU, too long for edge functions. Edge functions allow 2 s of CPU per request and can't run Python or ffmpeg. |
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
| End-to-end test | **Passed on the live site** with `tests/live-flow.mjs`: sign-in, uploads, hooks, script, preview ready 16 s after queueing, pack 61 s after, and the zip downloaded with every file. |
| Worker | **Live on GCP**: server `forge-worker` (e2-standard-2, us-central1-a), keys from Secret Manager. The end-to-end test passed against it on 2026-11-09: preview in 17 s, a two-ad pack in 168 s (about 3x slower than the Mac). |

**Open items for the owner:**
- **Email confirmation:** the project's built-in mailer sends only 2 emails an hour, and only to members of the Supabase team, so customers can't sign up while it's on. Either add custom SMTP (Google Workspace: smtp.gmail.com, port 587, with an app password for hassan@forgelaboratory.net or an alias) under Authentication → Emails, or turn off "Confirm email" while in beta. Turning it off was left to the owner, since it lowers security.
- **The Anthropic key**, to switch on AI suggestions.
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
