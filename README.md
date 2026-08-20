# Demo Studio

Narrated product-demo videos of a live website. **Kane mode** uses [Kane CLI](https://www.testmuai.com/support/docs/kane-cli-introduction/) to preflight (including native `result_code` 6xx aborts), click through, heal from evidence, and replay. **Normal mode** uses Playwright first-match clicks with no heal loop so you can compare outputs.

Jobs are stored in local Postgres. Videos and Kane artifacts go to a **Supabase Storage** bucket. Execution is a local Temporal server (one activity per phase, Chrome slot leases). Docker is optional and not required for local development.

## Prerequisites

- Node 20+
- Local Postgres (same instance as FounderBlaze is fine; we use database `demostudio`)
- [Temporal CLI](https://docs.temporal.io/cli) (`temporal server start-dev`)
- A Supabase project with Storage (URL + service role key; bucket `demo-studio` is created on API start if missing)
- Google Chrome
- `kane-cli` installed and logged in (`npm i -g @testmuai/kane-cli && kane-cli login`)
- `ffmpeg` on PATH. macOS TTS uses `say`; LMNT is used when `LMNT_API_KEY` is set.

## Env

Copy `env.example` to `.env` if you do not already have one. FounderBlaze `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` were copied into `.env` when this repo was set up. Fill blanks such as `KANE_WS_ENDPOINT` if you use the TestMu grid.

Demo Studio listens on **4031** so it does not clash with FounderBlaze on 4021.

## Run locally

```bash
npm install
npm run migrate

# Temporal (UI at http://localhost:8233)
temporal server start-dev

npx playwright install chromium

# four terminals
npm run dev:api
npm run dev:worker
npm run dev:studio
npm run dev:sample
```

- Studio UI: http://localhost:5173
- API: http://localhost:4031/health
- Sample product: http://localhost:4173
- Temporal UI: http://localhost:8233

Submit a job against the sample app (`http://localhost:4173`) first. Third-party URLs require the attestation checkbox.

Verify the studio itself with Kane:

```bash
kane-cli testmd run kane/studio_test.md --agent
kane-cli testmd run kane/sample-tour_test.md --agent
```

## API

```
POST /v1/jobs     { mode: "kane"|"naive", input: { website_url, script, ... } }
GET  /v1/jobs
GET  /v1/jobs/:id
GET  /v1/jobs/:id/events
GET  /v1/jobs/:id/artifacts/:kind
POST /v1/jobs/:id/confirm-script
POST /v1/jobs/:id/cancel
```

Header `Idempotency-Key` is optional. `confirm-script` is only needed when `require_script_confirm` is true.

`GET /v1/jobs/:id/artifacts/kane-log` is the full Kane CLI action log for that job (one line per navigate/click/type/assert/heal). `kane-jsonl` is the raw Kane NDJSON.

## What Kane CLI does in a job

Kane is the agent that drives the live site. The workflow is:

1. **Preflight** — `kane-cli run` loads the URL and checks for CAPTCHA, paywall, login walls.
2. **Understand** — Kane stores real nav labels, buttons, and field names from the page.
3. **Plan** — numbered briefs (`Step 1: … Step 2: …`) become one Kane action each (type, click, dropdown, checkbox, save).
4. **Record** — one `kane-cli run` per step. Kane clicks, types, and heals; we keep the screenshot after that action and mux it to that line of voiceover.
5. **Action log** — every Kane NDJSON event is written to `kane-actions.log` and shown in the Studio run console.

Example run against [surveys.free Google Forms alternative](https://surveys.free/google-forms-alternative/): creating a Birthday RSVP form (type title, Create it free, description, first question, Yes/no, allergies + required, Save).

- Studio job (local): http://localhost:5173/jobs/de0fa318-c51e-4b1e-b207-c9173453dccc
- Committed log: [`docs/kane-runs/surveys-free-form-builder.log`](docs/kane-runs/surveys-free-form-builder.log)
- Raw Kane NDJSON: [`docs/kane-runs/surveys-free-form-builder.jsonl`](docs/kane-runs/surveys-free-form-builder.jsonl)
- Job payload used: [`docs/kane-runs/surveys-free-job.json`](docs/kane-runs/surveys-free-job.json)

That log is the record of what Kane actually did in the browser, so you can point to it when explaining Kane’s role versus TTS/ffmpeg.

## Layout

- `apps/api` Fastify
- `apps/worker` Temporal workers (`control`, `kane-chrome`, `playwright`, `media`)
- `apps/studio` landing form, Kane/Normal tabs, job console, history
- `apps/sample-app` Northbeam marketing site
- `packages/shared` DB, Supabase Storage, schemas
- `packages/activities` Kane / Playwright / TTS / ffmpeg
- `packages/workflows` `KaneDemoWorkflow`, `NaiveDemoWorkflow`
- `kane/` committed `_test.md` suites
- `infra/docker-compose.yml` optional Postgres + Temporal only

## Railway

Create four services from this repo, each with its own Dockerfile:

| Service | Dockerfile | Notes |
| --- | --- | --- |
| `api` | `Dockerfile.api` | Port 4031. Runs migrations on boot. |
| `worker` | `Dockerfile.worker` | Playwright + ffmpeg + `kane-cli` + Linux `v16-runner`. Needs more RAM (2 GB+). |
| `studio` | `Dockerfile.studio` | Nginx. Set `API_UPSTREAM` to the private API URL, e.g. `http://api.railway.internal:4031`. |
| `sample` | (optional) `apps/sample-app` via `npm run start -w @demo-studio/sample-app` | Public URL becomes `SAMPLE_APP_URL`. |

Shared env on **api** and **worker**:

- `DATABASE_URL` (Railway Postgres)
- `TEMPORAL_ADDRESS` and `TEMPORAL_NAMESPACE` (Temporal Cloud or a Temporal service)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`
- `LMNT_API_KEY`, `LMNT_VOICE`
- `KANE_USERNAME`, `KANE_ACCESS_KEY`, `KANE_PROJECT_ID` (worker logs in on first job)
- `GEMINI_API_KEY` (script/voiceover planning; same key as FounderBlaze)
- `KANE_HEADLESS=1`, `KANE_CLI_SYSTEM_NODE=1`
- `PUBLIC_API_BASE_URL` = public API URL

Do not use macOS screen capture on Railway. The worker records Kane via CDP/Playwright and muxes Kane evidence screenshots if the screencast is missing.
