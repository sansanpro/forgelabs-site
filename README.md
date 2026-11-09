# ForgeLabs App Ad Studio

The site and product at [forgelaboratory.net](https://forgelaboratory.net): a self-serve tool that turns an app's real screens into a ready-to-test pack of vertical video ads. The pack has:
- hooks checked against the app's facts
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
| Render engine | `engine/forge_engine/` | Python (Pillow + ffmpeg) |
| Render worker | `engine/worker.py` | The owner's Windows PC (Hassano), as a boot-time scheduled task (`engine/deploy/windows/`). Any machine with Python 3.11+ works; `engine/deploy/gcp.sh` can set up a GCP server (deleted to save cost) |

`remove/` and `unsubscribe/` belong to ForgeLabs' earlier lead product and stay live so its opt-outs keep working. They still talk to that product's own Supabase project (`xhtwtnsvdmabfvewjgwz`), which is separate from the Studio's.

Everything in this repository is public, because it's served by GitHub Pages. Secrets go in `.env.local` (gitignored) and in Supabase secrets, never in code.

## Running it

**Secrets.** Put these in `.env.local` at the repo root. The file is gitignored; never commit or paste them.

```
SUPABASE_ACCESS_TOKEN=...        # Supabase account token: deploys the migration and functions
SUPABASE_SERVICE_ROLE_KEY=...    # the worker's key for the ForgeLabs project
ELEVENLABS_API_KEY=...           # voiceovers
ANTHROPIC_API_KEY=...            # optional: AI hook suggestions (set as a Supabase secret)
```

**The site.** It's plain files: open them through any static server, or push to `main` and GitHub Pages publishes them.

**The engine**, from `engine/`:

```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m tests.test_golden                      # re-renders the approved x2 ad and compares frames
.venv/bin/python -m tests.make_fixture                     # draws a test app ("Habitly")
.venv/bin/python -m forge_engine.cli preview tests/fixture.job.json --out tests/out/fixture
.venv/bin/python -m forge_engine.cli pack JOB.json --out OUT   # spends ElevenLabs credits
```

**The worker**, from `engine/`. It takes jobs from the queue until stopped:

```
.venv/bin/python worker.py
```

**The worker on a Windows PC**: see `engine/deploy/windows/install.ps1`. To update it after engine changes:

```
ssh t10admin@192.168.1.69 "cd /d C:\forge\forgelabs-site & git pull & schtasks /end /tn ForgeWorker & schtasks /run /tn ForgeWorker"
```

Its log is `C:\forge\worker.log`.

**The worker on Google Cloud** (the server was deleted to save cost; `engine/deploy/gcp.sh setup` recreates it), from the repo root, with Docker Desktop running:

```
engine/deploy/gcp.sh deploy    # after engine changes: rebuild the image, restart the worker
engine/deploy/gcp.sh secrets   # put the keys from .env.local into Secret Manager, restart
engine/deploy/gcp.sh logs      # recent worker log lines
```

**The backend.** These use the Supabase CLI v2; v3 rejects this config.

```
# database: run the migration through the Management API (it is safe to run again)
# functions:
npx -y supabase@2 functions deploy studio-ai --project-ref cuijqoorjgvlyiyizgxi --use-api
npx -y supabase@2 secrets set --project-ref cuijqoorjgvlyiyizgxi ANTHROPIC_API_KEY=...   # switches AI on
```

**Optional secret:** `STUDIO_AI_MODEL` overrides the AI model (the default is `claude-opus-5-5`).

## Limits during the beta

- **Packs:** every account gets one free pack (`studio_accounts.free_packs`). To give someone more, raise that number in the database. Setting `is_admin` removes all limits for that account.
- **Previews:** 40 a day per account.
- **AI calls:** 60 a day per account.
- **Failed packs:** a pack that fails is refunded automatically.
