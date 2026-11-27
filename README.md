# ForgeLabs App Ad Studio

The site and product at [forgelaboratory.net](https://forgelaboratory.net): a self-serve tool that turns an app's real screens into a ready-to-test pack of vertical video ads. The pack has:
- hooks checked for false claims
- a voiceover
- captions
- 9:16 and 4:5 images
- ad copy
- a test plan

- **Product plan and decisions:** [docs/PLAN.md](docs/PLAN.md)
- **The method the product follows:** [docs/AD-PLAYBOOK.md](docs/AD-PLAYBOOK.md)
- **The case study it grew out of** (StockMatcherAI's ads): [docs/HOW-THE-ADS-ARE-MADE.md](docs/HOW-THE-ADS-ARE-MADE.md)

## How it fits together

| Part | Where | Runs on |
|---|---|---|
| Landing page, terms, privacy | `index.html`, `terms/`, `privacy/`, `assets/forge.css`, `assets/motion.*`, `assets/hero.js`, `assets/blackhole.js` | GitHub Pages (static, no build step) |
| The Studio app | `app/index.html`, `assets/studio.js`, `assets/app.css` | GitHub Pages; talks to Supabase from the browser |
| Database, sign-in, file storage | `supabase/migrations/` | The Studio's Supabase project (`cuijqoorjgvlyiyizgxi`) |
| AI hook writer and claim check | `supabase/functions/studio-ai/` | Supabase Edge Functions, calling Claude |
| Start from a store link (name, line, icon, screenshots) | `supabase/functions/studio-store/` | Supabase Edge Functions, reading public App Store and Google Play listings |
| Render engine | `engine/forge_engine/` | Python (Pillow + ffmpeg) |
| Visit counting and the waitlist | `assets/visit.js`, the pricing form in `index.html`, `supabase/migrations/20261127120000_site.sql` | The browser calls `site_visit()` and `site_waitlist_join()` on the Studio's Supabase project: no cookies, no pixels. `supabase/launch-report.sql` reads both |
| Not-found pages | `404.html`, `pricing/` (sends people to `/#pricing`) | GitHub Pages |
| Render worker | `engine/worker.py` | The owner's Windows PC, as a boot-time scheduled task (`engine/deploy/windows/`). Any machine with Python 3.11+ works; `engine/deploy/gcp.sh` can set up a GCP server (deleted to save cost) |

`remove/` and `unsubscribe/` belong to ForgeLabs' earlier lead product and stay live so its opt-outs keep working. They still talk to that product's own Supabase project (`xhtwtnsvdmabfvewjgwz`), which is separate from the Studio's.

Everything in this repository is public, because it's served by GitHub Pages. Secrets go in `.env.local` (gitignored) and in Supabase secrets, never in code.

## Running it

**Secrets.** Put these in `.env.local` at the repo root. The file is gitignored; never commit or paste them.

```
SUPABASE_ACCESS_TOKEN=...        # Supabase account token: deploys the migration and functions
SUPABASE_SERVICE_ROLE_KEY=...    # the worker's key for the ForgeLabs project
ELEVENLABS_API_KEY=...           # voiceovers
ANTHROPIC_API_KEY=...            # optional: AI hook suggestions (set as a Supabase secret); on the worker, the director and quality check
SMTP_USER=noreply@forgelaboratory.net   # optional, on the worker: emails (Google Workspace, with an app password)
SMTP_PASSWORD=...
ALERT_EMAIL=...                  # optional, on the worker: who hears when a pack fails or skips its quality check
```

With the SMTP settings, the worker emails customers when a pack is ready or didn't finish (`MAIL_CUSTOMERS=0` turns that off) and sends alerts to `ALERT_EMAIL`. Without them, both only go to the worker's log.

**The site.** It's plain files: open them through any static server, or push to `main` and GitHub Pages publishes them.

**The engine**, from `engine/`:

```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m tests.test_golden                      # re-renders the approved x2 ad and compares frames
.venv/bin/python -m tests.test_screens                     # tablet screenshots shown whole, zooms moved off empty space
.venv/bin/python -m tests.make_fixture                     # draws a test app ("Habitly")
.venv/bin/python -m forge_engine.cli preview tests/fixture.job.json --out tests/out/fixture
.venv/bin/python -m forge_engine.cli pack JOB.json --out OUT   # spends ElevenLabs credits
```

**The worker**, from `engine/`. It takes jobs from the queue until stopped:

```
.venv/bin/python worker.py
```

**The worker on a Windows PC**: see `engine/deploy/windows/install.ps1`. It runs three workers side by side (`FORGE_WORKERS` in the system environment changes that). To update it after engine changes, `git pull` the PC's copy of the repo, then restart the ForgeWorker task from an administrator prompt (`schtasks /end /tn ForgeWorker`, then `schtasks /run /tn ForgeWorker`). Worker 1 logs to `C:\forge\worker.log`, the others to `worker-2.log` and so on.

**The worker on Google Cloud** (the server was deleted to save cost; `engine/deploy/gcp.sh setup` recreates it), from the repo root, with Docker Desktop running:

```
engine/deploy/gcp.sh deploy    # after engine changes: rebuild the image, restart the worker
engine/deploy/gcp.sh secrets   # put the keys from .env.local into Secret Manager, restart
engine/deploy/gcp.sh logs      # recent worker log lines
```

**The backend.** These use the Supabase CLI v2; v3 rejects this config.

```
# database: run the migrations through the Management API or the SQL editor (each is safe to run again)
# functions:
npx -y supabase@2 functions deploy studio-ai --project-ref cuijqoorjgvlyiyizgxi --use-api
npx -y supabase@2 functions deploy studio-store --project-ref cuijqoorjgvlyiyizgxi --use-api
npx -y supabase@2 secrets set --project-ref cuijqoorjgvlyiyizgxi ANTHROPIC_API_KEY=...   # switches AI on
```

**Optional secret:** `STUDIO_AI_MODEL` overrides the AI model (the default is `claude-sonnet-5-5`).

## Limits during the beta

- **Packs:** every account gets one free pack (`studio_accounts.free_packs`). To give someone more, raise that number in the database. Setting `is_admin` removes all limits for that account.
- **Previews:** 40 a day per account.
- **Renders waiting:** two queued or running per account at a time, so one account can't fill the queue. The app shows how many renders are ahead and when the renderer is off.
- **AI calls:** 60 a day per account, and 2,000 a day across all accounts (`studio_ai_allow()`).
- **Recordings:** up to 120 seconds, read only as MP4 or MOV.
- **Failed packs:** a pack that fails is refunded automatically. A job is finished only by the worker holding it, so a late report from a stalled worker can't overwrite or refund a finished pack.
