# demo.studio

The feature is done — then you still have to click through it on camera so everyone else can see it. At a hackathon, judges want a demo, so the last hour goes to recording instead of shipping. Thousands of builders face the same gap between *built* and *shown*.

That’s why we built **[demo.studio](https://studio-production-d6af.up.railway.app/)**: give a URL, a goal, who’s watching, and the on-screen actions — get a narrated **demo.mp4** of the live product. [Kane CLI](https://www.testmuai.com/support/docs/kane-cli-introduction/) is the hands on the page (and the agent that tests Studio end to end). Don’t record the walkthrough. Let Kane walk it.

Live app: [studio-production-d6af.up.railway.app](https://studio-production-d6af.up.railway.app/) · Pitch: [/pitch](https://studio-production-d6af.up.railway.app/pitch) · Verified: [/verified](https://studio-production-d6af.up.railway.app/verified). Clone this repo and follow [Quick start](#quick-start) to run the same stack locally. Watch the demo on [YouTube](https://www.youtube.com/watch?v=NlvFnU8O-b8)

## Table of contents

- [What it is](#what-it-is)
- [Who it is for](#who-it-is-for)
- [Lane 3](#lane-3)
- [Important links](#important-links)
- [Built with](#built-with)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Kane CLI verification](#kane-cli-verification)
  - [Contest bars](#contest-bars)
  - [Product path — Kane as hands](#product-path--kane-as-hands)
  - [Studio TestMD suite](#studio-testmd-suite-overview)
  - [studio-verify](#studio-verify)
  - [Cursor stop hook](#cursor-stop-hook)
  - [Proof Kane caught a bug](#proof-kane-caught-a-bug)
- [How it works](#how-it-works)
  - [What the operator does](#what-the-operator-does)
  - [Job lifecycle](#job-lifecycle)
  - [Why one Chrome session](#why-one-chrome-session)
  - [How picture meets voice](#how-picture-meets-voice)
  - [What happens when Kane cannot finish](#what-happens-when-kane-cannot-finish)
- [Kane CLI in this application](#kane-cli-in-this-application)
  - [How every Kane process is spawned](#how-every-kane-process-is-spawned)
  - [Command map](#command-map)
  - [Health, login, balance, and window](#health-login-balance-and-window)
  - [Preflight (`kane-cli run`)](#preflight-kane-cli-run)
  - [Understand (`kane-cli run`)](#understand-kane-cli-run)
  - [Generate (`kane-cli generate`)](#generate-kane-cli-generate)
  - [Compile TestMD](#compile-testmd)
  - [Author (`kane-cli testmd run`)](#author-kane-cli-testmd-run)
  - [CDP camera](#cdp-camera)
  - [Beat windows, harvest, and gates](#beat-windows-harvest-and-gates)
  - [NDJSON, action log, and the run console](#ndjson-action-log-and-the-run-console)
  - [Result codes and aborts](#result-codes-and-aborts)
  - [Evidence rewrite](#evidence-rewrite)
  - [Per-beat `run` helper](#per-beat-run-helper)
  - [Studio TestMD suite](#studio-testmd-suite)
- [Studio UI](#studio-ui)
- [HTTP API](#http-api)
- [Workers, storage, and data](#workers-storage-and-data)
- [Configuration](#configuration)
- [Example run](#example-run)
- [Optional Docker and Railway](#optional-docker-and-railway)
- [Repository layout](#repository-layout)

## What it is

demo.studio is a **browser-agent product studio**. You name a URL, a product, a goal, an audience, and a list of on-screen actions (type this, click that). The app compiles those actions into Kane TestMD, runs Kane against the live site, and returns:

- an MP4 of the real UI, timed to spoken narration
- SRT captions and a timeline
- a Kane action log and raw NDJSON of every navigate / click / type / assert

Kane is not a sidecar check after a human recorded a video. Kane **is** the hands on the page. The rest of the stack (Temporal workflow, Gemini planning fallback, LMNT or `say` for voice, Playwright CDP screenshots, ffmpeg mux) exists to make that session into something a founder can send to a customer.

## Who it is for

- **Engineers and PMs at work** — the feature is done, but you still have to click through it on camera so everyone else can see it. demo.studio turns that walkthrough into a film from a brief instead of another Loom session.
- **Hackathon builders** — judges want a demo; the last hour should go to shipping, not recording. Generate a narrated tour of the live product and keep building.
- **Founders and PMs** who need a current walkthrough of a SaaS surface without sitting in Loom.
- **Sales engineers and marketers** who want a repeatable “click through this funnel” film from a brief, not from a designer timeline.
- **Teams already using Kane** who want Kane’s browser work to produce a customer-facing artifact, not only a pass/fail in CI.
- **Builders wiring an agent to the open web**, where there is no first-party API: Kane is the actuator; demo.studio is the product that schedules it, films it, and stores the proof.

Default generate form is prefilled for [surveys.free](https://surveys.free/google-forms-alternative/) (Birthday RSVP form builder) so a first run has a concrete multi-step UI: title, **Create it free**, description, question type, required checkbox, save.

## Lane 3

This project is built for **Lane 3 — browser agents in the wild**: Kane CLI as an agent’s hands on the web. The job is not “write a dashboard and then smoke-test it.” The job is **do work in someone else’s browser** — fill a form builder, dismiss cookies, type exact values, click labeled controls — and ship the film of that work.

How demo.studio matches Lane 3:

- An operator (or an upstream agent) supplies English actions. Kane CLI executes them in a real Chrome, with `--agent`, TestMD, stored variables, and local context. There are no CSS selectors in the product path.
- The same Kane process that acts is the process that is filmed. Playwright is only a CDP camera on Kane’s painted `http(s)` tab; it does not click.
- Kane’s NDJSON is the live telemetry of the product: the Studio console, beat timestamps, heal evidence, and abort codes all come from Kane, not from a mock.
- A committed TestMD suite also drives **Studio itself**. [`studio-verify`](#studio-verify) maps a Cursor working-tree diff onto those files, replays them with Kane, and a **stop hook** will not let the coding agent finish until protected observables match a trusted baseline.

## Important links

| | |
| --- | --- |
| **Demo video** | https://www.youtube.com/watch?v=NlvFnU8O-b8 |
| **Live Studio** | https://studio-production-d6af.up.railway.app/ |
| **Pitch deck** | https://studio-production-d6af.up.railway.app/pitch |
| **Verified (Kane gate)** | https://studio-production-d6af.up.railway.app/verified |
| **API health** | https://api-production-27b6.up.railway.app/health |
| **Kane Studio test results** | [`docs/kane-runs/studio-e2e/RESULTS.md`](docs/kane-runs/studio-e2e/RESULTS.md) |
| **Studio verify proof** | [`docs/kane-runs/verify/`](docs/kane-runs/verify/) — blocked + green Kane reports |
| **Example product run** (surveys.free) | [`docs/kane-runs/surveys-free-job.json`](docs/kane-runs/surveys-free-job.json) · [log](docs/kane-runs/surveys-free-form-builder.log) · [NDJSON](docs/kane-runs/surveys-free-form-builder.jsonl) |

## Built with

This codebase was written in **Cursor**, using the **Cursor Grok 4.6** model, with Kane CLI as the browser runtime the agent calls.

| Service / tool | Purpose in demo.studio |
| --- | --- |
| **Kane CLI** (`kane-cli`) | Browser agent: login, credits, `run`, `generate`, `testmd run`, NDJSON, result codes, evidence zips. |
| **Cursor (Grok 4.6)** | Authored the monorepo, workflows, TestMD compiler, Studio UI, the Studio TestMD suite, and studio-verify. |
| **studio-verify** | Git-diff → Kane TestMD replay → baseline compare; Cursor stop hook. |
| **Temporal** | Durable `KaneDemoWorkflow`: slots, retries, heartbeats, cancel. |
| **PostgreSQL** | Jobs, event log, Chrome slot leases. |
| **Supabase Storage** | Private bucket for MP4, captions, TestMD, Kane logs, stills metadata. |
| **Google Gemini** | Optional beat planner: grounds labels and voiceover from `understand.jpg`. Cannot add, drop, or reorder the wizard’s `walkthrough`. |
| **LMNT** | Cloud TTS when `LMNT_API_KEY` is set; otherwise macOS `say` / espeak. |
| **Playwright Chromium** | Launches Chrome with `--remote-debugging-port` and JPEG-screenshots the active Kane tab. |
| **ffmpeg** | Stills → silent video, mux to WAV, concat, captions. |
| **Fastify** | Job API on port **4031**. |
| **Vite + React** | Studio on port **5173**, proxies `/v1` to the API. |
| **Zod** | Job and beat validation. |
| **Google Chrome** | The browser Kane and CDP attach to (leave `KANE_WS_ENDPOINT` empty for local Chrome). |

## Prerequisites

- Node.js 20+
- Local Postgres (database `demostudio` is fine; same instance as other local apps is fine)
- [Temporal CLI](https://docs.temporal.io/cli): `temporal server start-dev`
- A Supabase project with Storage (URL + service role key). The API creates bucket `demo-studio` if it is missing.
- Google Chrome
- Kane CLI installed and logged in: `npm i -g @testmuai/kane-cli && kane-cli login`
- `ffmpeg` on `PATH`
- `npx playwright install chromium` (CDP camera only)
- Optional: `GEMINI_API_KEY`, `LMNT_API_KEY`

Copy [`env.example`](env.example) to `.env`. Do not commit `.env`.

Demo Studio listens on **4031** so it does not clash with other local APIs on 4021.

## Quick start

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
```

- Studio: http://localhost:5173
- API: http://localhost:4031/health
- Temporal: http://localhost:8233

Generate is prefilled for surveys.free. Third-party URLs require the “I have the right to record” checkbox.

Walk Studio with Kane (Studio `:5173` and API `:4031` must already be serving):

```bash
npm run test:kane
npm run test:studio-verify # NDJSON parse + comparator (no credits)
npm run verify:baseline    # record trusted observables (once, on a known-good build)
npm run verify:status
npm run verify -- --all
```

The 21 August 2026 suite rollup is in [`docs/kane-runs/studio-e2e/RESULTS.md`](docs/kane-runs/studio-e2e/RESULTS.md). The 30 August Continue-submit catch (blocked then green) is in [`docs/kane-runs/verify/`](docs/kane-runs/verify/).

## Kane CLI verification

The contest asked for a working app, Kane that actually exercised it, and an agent↔Kane loop. demo.studio uses Kane in **three** places, all `--agent`, none of them selector scripts.

| Layer | Kane’s job | Where |
| --- | --- | --- |
| **Product (Lane 3)** | Hands on a third-party site. `KaneDemoWorkflow` runs `kane-cli run` then `testmd run` on the customer URL and films that session. | [`packages/workflows`](packages/workflows/src/index.ts), [`packages/activities`](packages/activities/src/kane.ts) |
| **Studio suite** | Hands on demo.studio itself. Committed `kane/*_test.md` walk Generate, Gallery, and `/health`. They never click Generate (that would spawn a second Kane job). | [`kane/`](kane/), `npm run test:kane` |
| **Gate (studio-verify)** | Same suite, driven by a Cursor **stop hook**. Git diff → mapped flows → Kane replay → compare to a committed baseline. A miss continues the agent; a match lets it stop. | [`packages/studio-verify`](packages/studio-verify), [`.cursor/hooks.json`](.cursor/hooks.json) |

The product path is unchanged by the gate. `packages/activities` and `packages/workflows` are ignored by the flow map so a Generate-pipeline edit does not require clicking Generate.

### Contest bars

Judges score Ships, Verified, Closed loop, and Craft equally; ties break on Verified, then Closed loop. The hoped-for demo is: hook fires Kane, Kane fails, the agent edits, Kane runs again.

- **Ships.** A user loads Studio, fills Site → Brief → Access → Launch, and gets a narrated MP4 of the live product. Deployed: [studio-production-d6af.up.railway.app](https://studio-production-d6af.up.railway.app/). Primary flow is Kane on [surveys.free](https://surveys.free/google-forms-alternative/), not a mock.
- **Verified.** Kane exercised both surfaces. Product: [`docs/kane-runs/surveys-free-form-builder.jsonl`](docs/kane-runs/surveys-free-form-builder.jsonl). Studio: 21 Aug **6 / 6 passed** ([`docs/kane-runs/studio-e2e/RESULTS.md`](docs/kane-runs/studio-e2e/RESULTS.md)); that run also **caught** Continue on Access submitting Generate (`type="submit"`). 30 Aug: the same class of bug was replanted locally; Kane failed the wizard at Site to Brief; after restore, `launch_heading` matched the baseline ([`docs/kane-runs/verify/`](docs/kane-runs/verify/)). Verdicts use `test_md_summary.overall_status`, not the first `run_end` and not Kane’s process exit code alone.
- **Closed loop.** Cursor Grok 4.6 writes Studio. On stop, [`.cursor/hooks.json`](.cursor/hooks.json) runs `studio-verify hook`. A behavioral miss returns `{ followup_message }` (the Cursor equivalent of blocking completion) with flow, failed step, protected key, baseline vs observed, and NDJSON path. The agent must repair **the app**, not the TestMD. `loop_limit` is 3. Heal inside a Generate job (`rewriteFailedBeat`) is Kane→pipeline on the customer site; the stop hook is Kane→coding agent on Studio. Both are closed loops; the contest’s “hook fires Kane” moment is the stop hook.
- **Craft.** Kane is browser infrastructure for a film (Lane 3), not a smoke test bolted onto a todo app. The gate is the extra: diff-scoped replay, named observables, fail-open on infra, `/verified` for judges.

### Product path — Kane as hands

`KaneDemoWorkflow`: health → Chrome slot → `kanePreflight` (`run`) → `kaneUnderstand` (`run`, harvests `understand.jpg`) → `planDemoBeats` (wizard posts `walkthrough: filledActions`; Gemini may ground labels/VO from the screenshot but **cannot add, drop, or reorder** actions) → TTS → `compileTestMd` + `kaneTestmdRun` in **one** Chrome with a CDP JPEG camera → `assembleDemo`. Playwright does not click. Destination-not-control success lives in [`beat-gates.ts`](packages/activities/src/beat-gates.ts). Incomplete Kane runs fail the job; assemble does not equal-slice a failed session and mark beats passed.

Example film evidence: [`docs/kane-runs/surveys-free-job.json`](docs/kane-runs/surveys-free-job.json), [log](docs/kane-runs/surveys-free-form-builder.log), [NDJSON](docs/kane-runs/surveys-free-form-builder.jsonl).

### Studio TestMD suite {#studio-testmd-suite-overview}

`kane-cli --local testmd run … --agent --headless`. Store-as lines persist named observables for the gate. Timeouts on the long walks are 180s.

| File | Covers | Protected / observed |
| --- | --- | --- |
| [`kane/studio_landing_test.md`](kane/studio_landing_test.md) | Branding, Site defaults | `default_product` |
| [`kane/studio_wizard_test.md`](kane/studio_wizard_test.md) | Site → Brief → Access → Launch; no Generate click | `launch_heading`, `wizard_url` |
| [`kane/studio_validation_test.md`](kane/studio_validation_test.md) | Empty URL stays on Site | `url_required_message` |
| [`kane/studio_gallery_test.md`](kane/studio_gallery_test.md) | Library + optional job tile | `gallery_heading` |
| [`kane/api_health_test.md`](kane/api_health_test.md) | `GET /health` | `health_ok` (observed, not blocking) |
| [`kane/studio_test.md`](kane/studio_test.md) | Smoke Brief + Gallery | used by `npm run test:kane` only |

21 Aug (`kane-cli` 0.8.4): **6 / 6 passed**. Continue-submit was already fixed in that rollup.

### studio-verify

[`packages/studio-verify`](packages/studio-verify) (`@demo-studio/verify`) is the gate, not a second product. Kane still walks Studio; this package decides *which* TestMD files to replay after a Cursor edit and whether the coding agent may stop.

Committed:

| Path | Role |
| --- | --- |
| [`.studio-verify/config.json`](.studio-verify/config.json) | Studio/API URLs, timeouts, per-flow TestMD + `protect` / `observe` keys, ignore globs |
| [`.studio-verify/flow-map.json`](.studio-verify/flow-map.json) | Git path → flows. Empty array = “this file is not behavior.” |
| [`.studio-verify/baseline.json`](.studio-verify/baseline.json) | Trusted Kane observations from a known-good build |

Gitignored (live only): `.studio-verify/last-verify.json`, `.studio-verify/runs/*.ndjson`, `.studio-verify/state/` (lock + per-session attempt counter).

```text
git diff (unstaged + staged + untracked)
        → drop ignore globs (Lane 3 packages, docs, kane/, the tool itself, README, lockfile)
        → map remaining paths to flows (Home.tsx → landing + wizard + validation)
        → unmapped studio file → fallback flow `landing` only
        → kane-cli --local testmd run <file> --agent --headless
        → parse NDJSON: file verdict = test_md_summary.overall_status
          (first run_end is step one of a multi-step file — never the suite result)
        → harvest store-as from final_state, context.variables, and context.memory
        → compare protect keys to baseline (SAME / UNEXPECTED_CHANGE / MISSING;
          blank stored string = MISSING, not an empty surprise)
        → persist last-verify.json
```

**Verdicts.** `blocked` = Kane `failed` or a protected key is `UNEXPECTED_CHANGE`. `error` = could not tell (kane-cli exit 2/3, empty stream, timeout, budget skip, Studio/API down). `passed` = every selected flow passed and no unexpected deltas. `observe` keys (today `health_ok`) are allowed to move; they never block. `MISSING` is not a block by itself — Kane still has to fail the TestMD or a protected value has to *change*. One flake retry per flow. Highest risk first (`wizard`, `validation`). Hook budget 1200s; per-test timeout 180s.

**CLI** (`tsx packages/studio-verify/src/cli.ts`, wrapped by npm scripts):

| Command | What it does | Exit |
| --- | --- | --- |
| `npm run verify:status` | Diff, blast radius, baseline observables — no browser | 0 |
| `npm run verify:baseline [-- --flow wizard]` | Record green Kane observations; refuses to overwrite from a red run | 0 / 2 if app down |
| `npm run verify [-- --all \| --flow a,b]` | Replay mapped (or named) flows vs baseline | 0 passed, 1 blocked, 2 error |
| `npm run cli -w @demo-studio/verify -- hook` | Cursor stop (stdin payload). Always exit 0; block via JSON | 0 |
| `npm run verify:plant` / `verify:restore` | Local Continue-submit drill; **do not commit** planted `Home.tsx` | — |
| `npm run test:studio-verify` | 16 unit tests: NDJSON parse, comparator, globs (no credits) | 0/1 |

Unit tests encode the load-bearing parse: the file verdict is `test_md_summary`, not the first `run_end`; exit 2/3 is infra, never “your UI broke.”

Blast radius (behavior-relevant only):

| Glob | Flows |
| --- | --- |
| `apps/studio/src/pages/Home.tsx` | landing, wizard, validation |
| `Gallery.tsx`, `Job.tsx` | gallery |
| `App.tsx`, `components/**`, `styles.css` | landing, gallery |
| `apps/api/**` | api_health |
| `packages/activities/**`, `workflows/**`, `shared/**` | ignored (Lane 3 film path) |
| `kane/**`, `.studio-verify/**`, `.cursor/**`, `docs/**`, Pitch, Verified | ignored / no flows |

`GET /v1/verified` returns `{ live, blocked, verified, baseline, source }`: live `last-verify.json` when present, else committed snapshots under `docs/kane-runs/verify/` (copied to `apps/studio/public/verified/` for the SPA).

### Cursor stop hook

[`.cursor/hooks.json`](.cursor/hooks.json) `stop` → [`studio-verify-stop.sh`](.cursor/hooks/studio-verify-stop.sh) → `tsx …/cli.ts hook`. Cursor timeout 1800s, `loop_limit` 3, `failClosed: false` (a crashed hook must not freeze the agent). Missing `tsx` prints `{}` and exits 0.

Stdout contract:

| Situation | stdout | Agent |
| --- | --- | --- |
| No mapped flows (docs, README, Lane 3 packages, Pitch, Verified) | `{}` | may stop; no Chrome |
| Behavioral `blocked` | `{ "followup_message": "<flow, failed step, key, baseline vs observed, NDJSON path>" }` | must continue; repair **Studio**, not TestMD / baseline |
| Infra, no baseline, app down, lock held, attempt cap (`maxAttempts` 3), re-entry (`stop_hook_active`) | `{}` plus a log note | may stop; protected behavior was **not** confirmed |

Requires Studio `http://localhost:5173` and API `http://localhost:4031/health`. The hook logs in Kane from `.env` if `KANE_USERNAME` / `KANE_ACCESS_KEY` are set.

### Proof Kane caught a bug

1. **Historical (21 Aug).** Continue on Access submitted Generate. TestMD required Launch (“Ready to record”) and a Generate URL with no `/jobs/<id>`. Fixed: Continue is `type="button"` with `onClick={next}`; form `onSubmit` only `preventDefault`s. Evidence: [`docs/kane-runs/studio-e2e/RESULTS.md`](docs/kane-runs/studio-e2e/RESULTS.md).
2. **Closed-loop drill (30 Aug).** `npm run verify:plant` set Continue to `type="submit"` and dropped `onClick={next}`. Kane failed at **Site to Brief** (Continue never advanced). [`blocked-run.json`](docs/kane-runs/verify/blocked-run.json) + [`verify-wizard-blocked.ndjson`](docs/kane-runs/verify/verify-wizard-blocked.ndjson). Restore; Kane passed with `launch_heading=Ready to record surveys.free` SAME. [`verified-run.json`](docs/kane-runs/verify/verified-run.json). `Home.tsx` on the branch is the good button. Runbook: [`docs/kane-runs/verify/DEMO.md`](docs/kane-runs/verify/DEMO.md). Do not prompt “fix the Continue bug” — that skips Kane.

[`/verified`](https://studio-production-d6af.up.railway.app/verified) renders live `GET /v1/verified` or the committed snapshots under `apps/studio/public/verified/`. Pitch includes a stop-hook slide.

## How it works

You fill in a short wizard (site, brief, optional login, launch). Studio posts a job to the API; Temporal runs **KaneDemoWorkflow**. Kane CLI logs in and checks credits, opens the real URL to make sure the page is reachable (no CAPTCHA / paywall / login wall that would block the demo), then explores the live UI and remembers what buttons and fields are there. The wizard’s `walkthrough` (and numbered `Step N:` script) is the locked beat skeleton; Gemini may ground labels and voiceover from `understand.jpg` but cannot invent extra steps. Each beat gets a spoken voiceover (LMNT). Kane then walks those steps in **one** Chrome window while a camera (Playwright over CDP) takes JPEG stills of the painted page—not a separate clicker. ffmpeg cuts those stills to match each voiceover, stitches the clips, uploads `demo.mp4` plus captions and logs to storage, and the Gallery shows the finished film.

In plain English, end to end:

1. **You describe the demo** — URL, product name, goal, audience, and the clicks/types you want on screen (e.g. Birthday RSVP on surveys.free).
2. **Studio packages the brief** — four steps: Site → Brief → Access → Launch; actions are posted as `walkthrough` and as numbered `Step N:` lines in `script`.
3. **The API starts the workflow** — job lands in Postgres; Temporal `KaneDemoWorkflow` begins.
4. **Kane is ready** — `whoami` / login / balance / window size; a free Chrome debugging slot is leased so jobs do not collide.
5. **Preflight** — Kane opens the start URL and aborts early if the site is blocked (CAPTCHA, Cloudflare, paywall, hard login wall, MFA).
6. **Understand** — a second Kane run maps live nav, inputs, and CTAs into `context.md` / variables and copies the last screenshot to `understand.jpg`.
7. **Plan beats** — lock the user’s `walkthrough` (or numbered `Step N:`); Gemini may ground labels and VO from the screenshot but cannot add/reorder actions; success checks are destination-not-control.
8. **Optional confirm** — if required, you approve the planned script before filming continues.
9. **Voiceover** — each beat’s narration becomes a WAV (LMNT in cloud; `say` / edge-tts / espeak as fallbacks).
10. **Author on camera** — TestMD is compiled; Kane runs `testmd run --agent` in the same Chrome while JPEG stills of the real tab are recorded.
11. **Assemble and ship** — stills + WAVs → beat clips → one MP4, captions, timeline, Kane log/NDJSON → Supabase; job marked completed in the Gallery.
12. **If Kane cannot finish** — result codes and abort reasons surface in the job UI; Chrome slots are always released.

### What the operator does

Studio is a four-step wizard ([`apps/studio/src/pages/Home.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/pages/Home.tsx)):

1. **Site** — `website_url` and `product_name`.
2. **Brief** — goal, audience, outcome, and an ordered list of on-screen actions.
3. **Access** — optional username/password (stored redacted in Postgres; secrets are passed only into the workflow args).
4. **Launch** — attestation, then `POST /v1/jobs`.

`composeScript` ([L22–L32](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/pages/Home.tsx#L22-L32)) folds goal, audience, outcome, and actions into one `script` string whose walkthrough section is **`Step 1: … Step 2: …`**. Submit always sends `mode: "kane"` and `walkthrough: filledActions` ([L98–L108](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/pages/Home.tsx#L98-L108)) so the planner can lock those intents even if Gemini runs.

The API validates the body ([`createJobBodySchema`](https://github.com/SamFelix03/demo.studio/blob/main/packages/shared/src/schema.ts#L68-L71)), redacts credentials ([`sanitizeInputForDb`](https://github.com/SamFelix03/demo.studio/blob/main/packages/shared/src/schema.ts#L73-L90)), inserts the job ([`insertJob`](https://github.com/SamFelix03/demo.studio/blob/main/packages/shared/src/db.ts#L47)), and starts Temporal workflow `KaneDemoWorkflow` ([`apps/api/src/server.ts` L120+](https://github.com/SamFelix03/demo.studio/blob/main/apps/api/src/server.ts)).

### Job lifecycle

The entire product path is [`KaneDemoWorkflow`](https://github.com/SamFelix03/demo.studio/blob/main/packages/workflows/src/index.ts#L93-L200). Activities are split across Temporal queues so Chrome work, planning, and ffmpeg do not block each other ([`packages/workflows/src/queues.ts`](https://github.com/SamFelix03/demo.studio/blob/main/packages/workflows/src/queues.ts), worker [L12–L20](https://github.com/SamFelix03/demo.studio/blob/main/apps/worker/src/main.ts#L12-L20)).

```text
Studio brief  →  POST /v1/jobs  →  KaneDemoWorkflow
                                      │
                   toolingHealth      │  kane-cli whoami / login / balance / config
                   Chrome slot        │  lease a local debugging port
                   kanePreflight      │  kane-cli run  (walls, CAPTCHA, login)
                   kaneUnderstand     │  kane-cli run  (nav, fields, CTAs, understand.jpg)
                   planDemoBeats      │  locked walkthrough; Gemini grounds VO/labels only
                   [optional signal]  │  confirm-script
                   synthesizeBeats    │  LMNT or say → WAV per beat
                   compileTestMd      │  demo_test.md + helpers
                   kaneTestmdRun      │  kane-cli testmd run --agent  (same Chrome)
                   assembleDemo       │  JPEG windows × WAV → MP4 → Supabase
```

Step by step, matching workflow lines:

1. **`health`** — [`toolingHealth`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/control.ts#L23-L71) proves `kane-cli` is on PATH and authenticated. [`acquireChromeSlot`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/control.ts#L73-L90) leases a debugging port so two jobs do not share a profile.
2. **`preflight`** — [`kanePreflight`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L50-L128) runs Kane on the start URL with a store-and-assert objective (cookie banner, CAPTCHA, Cloudflare, login wall, MFA, paywall). [`abortFromRunEnd`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/control.ts#L136-L169) maps Kane `result_code` and `final_state` into a non-retryable abort the UI can show.
3. **`understand`** — [`kaneUnderstand`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L130-L197) runs a second `kane-cli run` that **stores** live labels (`nav_items`, `hero_cta`, `inputs`, …) into Kane `final_state`, writes `context.md` / `variables.json`, and copies the last Kane screenshot to `understand.jpg` for the planner. The Chrome slot is released so planning/TTS do not hold a browser.
4. **`plan`** — [`planDemoBeats`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/plan.ts#L301-L347). `input.walkthrough` (or numbered `Step N:` / provided `beats`) is the locked skeleton. Gemini may fill narration and destination success from the understand screenshot; it cannot add, drop, or reorder actions. Fuzzy briefs drop steps the script does not entail instead of inventing a Features/Pricing tour. [`tightenBeatGates`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/beat-gates.ts) rewrites success so a click is not “verified” by the control just clicked.
5. **`await_script` (optional)** — if `require_script_confirm`, the workflow waits on [`confirmScriptSignal`](https://github.com/SamFelix03/demo.studio/blob/main/packages/workflows/src/index.ts#L27) until `POST /v1/jobs/:id/confirm-script`.
6. **`tts`** — [`synthesizeBeats`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/media.ts#L284-L346) synthesizes each beat’s `narration` to WAV and records durations. Those durations are the edit list for the film.
7. **`author`** — a second Chrome slot. [`compileTestMd`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L468-L535) writes `demo_test.md`. [`kaneTestmdRun`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L537-L669) runs **one** `testmd run --agent` while [`runWithRecordedChrome`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/chrome-session.ts#L29-L104) JPEG-captures the painted tab.
8. **`upload`** — [`assembleDemo`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/media.ts#L348-L537) slices stills per beat window, muxes each slice to that beat’s WAV ([`sealBeat`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/media.ts#L226)), concatenates, uploads `demo.mp4` / captions / timeline, and marks the job completed.

The job page ([`apps/studio/src/pages/Job.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/pages/Job.tsx)) polls job JSON and `/v1/jobs/:id/events`, renders [`PipelineStage`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/components/PipelineStage.tsx#L7-L15) and [`KaneConsole`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/components/KaneConsole.tsx), and can cancel via Temporal (`POST /v1/jobs/:id/cancel`).

### Why one Chrome session

A product demo is stateful: type a title, click **Create it free**, land on `/edit`, type a description. Separate `kane-cli run --url` processes would reload the start URL and wipe the form. The author phase therefore compiles **one TestMD file** and runs it once, with Kane attached to the CDP endpoint of a persistent Playwright context ([`KANE_CDP_ENDPOINT`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/chrome-session.ts#L43-L64) + [`extraKaneFlags`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L27-L34)).

### How picture meets voice

Kane’s first Playwright tab is `about:blank`. Filming that tab is a white frame. The camera therefore:

- picks the last `http(s)` page in the context ([`isPaintedPage` / `activePage`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/chrome-session.ts#L10-L22))
- writes JPEG + `{ t, file, url }` to `stills/live/index.jsonl` every 250ms ([L67–L84](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/chrome-session.ts#L67-L84))
- never treats an empty window as a new scene: [`framesInWindow`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L457-L466) carries the last painted frame

NDJSON events are timestamped during `testmd run` ([L549–L554](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L549-L554)). [`assignBeatWindows`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L363) maps those events onto beats. `assembleDemo` uses the live index plus audio seconds so each spoken line is the page **after** that action.

Typing instructions put the **exact unquoted value on its own line** in TestMD ([L492–L499](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L492-L499)); success for a type beat is that string ([`typedValueFromAction`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/beat-gates.ts#L3-L8)). Kane is told to type once and not wrap the value in quotes or brackets.

### What happens when Kane cannot finish

- Preflight aborts (CAPTCHA, paywall, MFA, login without credentials) become job `aborted` with a human message ([`ABORT_MESSAGES`](https://github.com/SamFelix03/demo.studio/blob/main/packages/shared/src/types.ts#L105-L118)).
- If Kane never clicked or never typed when the plan required it, `kaneTestmdRun` fails `unsupported_ui` ([L615–L667](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L615-L667)).
- Workflow `catch` publishes the Kane log and marks the job failed/aborted ([`persistFailure`](https://github.com/SamFelix03/demo.studio/blob/main/packages/workflows/src/index.ts#L59-L74)).
- [`rewriteFailedBeat`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L671-L712) can unzip Kane evidence, read `failure.yaml`, and rewrite the next instruction from the remark and `result_code` (for example 320 = pick another path). That is how Kane’s failure text feeds the next agent turn on the same job.

## Kane CLI in this application

Every product feature that touches a website goes through Kane. The following is the full map of CLI surface area, flags, and the source that builds the argv.

### How every Kane process is spawned

[`spawnKane`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/spawn.ts#L60-L152) always `spawn("kane-cli", argv)` with `shell: false`.

| Behavior | Code |
| --- | --- |
| Inject `--local` for `run` / `testmd` / `generate` unless `KANE_WS_ENDPOINT` (cloud Chrome) is set | [`kaneArgv` L32–L39](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/spawn.ts#L32-L39) |
| `PATH` includes `~/.local/bin`; `KANE_CLI_USER_AGENT=demo-studio`; `KANE_CLI_SYSTEM_NODE` | [`kaneEnv` L42–L57](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/spawn.ts#L42-L57) |
| Strip `KANE_USERNAME` / `KANE_ACCESS_KEY` from the child env when using local Chrome (avoid forcing cloud auth) | [L53–L56](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/spawn.ts#L53-L56) |
| Parse stdout NDJSON line-by-line; `onEvent` for live console | [L81–L94](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/spawn.ts#L81-L94) |
| Temporal heartbeat on stdout/stderr tails | [L111–L127](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/spawn.ts#L111-L127) |
| Timeout → SIGTERM then SIGKILL | [L95–L109](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/spawn.ts#L95-L109) |
| `run_end` / `testrun_done` / `generate_done` extracted as `runEnd` | [`lastRunEnd` L20–L27](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/spawn.ts#L20-L27) |

[`extraKaneFlags`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L27-L34) adds, in order:

- `--ws-endpoint` if `KANE_WS_ENDPOINT` is set (TestMu grid)
- else `--cdp-endpoint` if `KANE_CDP_ENDPOINT` is set (author camera)
- `--headless` when not headed and not already on CDP

`--username` / `--access-key` on argv are redacted in job events ([`redactArgv`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L41-L47)).

Working directory for browser commands is the per-job folder [`workDir`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/workdir.ts).

### Command map

| Kane CLI | When | Source |
| --- | --- | --- |
| `whoami` | Health | [`control.ts` L29, L49](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/control.ts#L29) |
| `login --username --access-key [--project-id]` | Health if whoami fails and env creds exist | [L31–L41](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/control.ts#L31-L41) |
| `balance` | Health / credits snapshot | [L51](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/control.ts#L51) |
| `config show` | Health | [L52](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/control.ts#L52) |
| `config set-window 1440x900` | Match Studio viewport | [L53](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/control.ts#L53) |
| `run <objective> --agent --mode action --url --timeout --max-steps` | Preflight, understand, optional per-beat helper | [`kanePreflight` L68–L80](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L68-L80), [`kaneUnderstand` L145–L158](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L145-L158), [`kaneRecordBeats` L754–L767](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L754-L767) |
| `generate <prompt> --agent --url` | Optional TestMD generation | [`kaneGenerate` L210](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L210) |
| `generate --save --req <id> --out <dir> --agent` | Persist generated suite | [L221–L224](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L221-L224) |
| `testmd run <demo_test.md> --agent --name --timeout --max-steps [--local-context] [--variables-file]` | **Live author path** | [`kaneTestmdRun` L556–L571](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L556-L571) |
| `testmd run kane/studio_*_test.md --agent` | Walk Studio UI / health | [`kane/`](kane/), also spawned by [`studio-verify`](packages/studio-verify/src/kane.ts) |

### Health, login, balance, and window

[`toolingHealth`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/control.ts#L23-L71) is the first activity in every job. If Kane is missing or unauthenticated, the workflow fails `controller_auth` immediately instead of opening a blank Chrome. `balance` is captured so operators can see credit state. `config set-window 1440x900` matches the CDP viewport ([`chrome-session.ts` L50](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/chrome-session.ts#L50)) and the Studio `viewport` field.

### Preflight (`kane-cli run`)

Objective (plain English Kane stores) is built in [`kanePreflight`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L56-L66): dismiss consent if needed; store `page_title`, `page_url`, `has_captcha`, `has_bot_challenge`, `has_login_wall`, `has_mfa`, `has_paywall`; assert main content unless a blocker is present.

Flags: `--agent --mode action --url <website> --timeout 60 --max-steps 15` plus extraKaneFlags. Events go through [`kaneEventHandler(..., "preflight")`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L85-L89). `run_end.json` is uploaded to storage. Native Kane 6xx codes are mapped in [`RESULT_ABORT_CODES`](https://github.com/SamFelix03/demo.studio/blob/main/packages/shared/src/types.ts#L95-L103) (`610` captcha, `620` paywall, `640` access denied, `660` login, `550` controller auth, `560` credits). Login wall is ignored when the job actually has credentials ([`abortFromRunEnd` L142](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/control.ts#L142)).

`initKaneActionLog` starts `kane-actions.log` on this call ([L56](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L56), [`kane-log.ts` L71–L87](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane-log.ts#L71-L87)).

### Understand (`kane-cli run`)

[`kaneUnderstand`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L130-L197) is a second agent run (`--timeout 90 --max-steps 20`) whose job is **inventory**, not conversion: store nav labels, hero, buttons, inputs, headings, offerings; do not click through to checkout. Output:

- `context.md` — instructions Kane later loads with `--local-context`
- `variables.json` — site JSON plus optional secret username/password for `--variables-file`
- Storage copies of both
- `understand.jpg` — last Kane screenshot of the start URL, passed into `planDemoBeats`
- `final_state` returned to the planner

This is how Kane enables planning: Gemini sees **labels Kane actually read** plus the start-page screenshot. The user’s `walkthrough` stays locked; Gemini does not invent a site tour.

### Generate (`kane-cli generate`)

[`kaneGenerate`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L220) calls Kane’s generator (`generate <prompt> --agent --url`), then `generate --save --req <request_id> --out <dir>` to pull the markdown. The live workflow compiles TestMD itself from beats; this helper is the Kane-native generator wired for the same job directory.

### Compile TestMD

[`compileTestMd`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L468-L535) is the compiler from demo.studio beats → Kane TestMD.

It writes [`helpers/dismiss_chrome.md`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L475-L479) (cookie/consent/chat) and a `demo_test.md` with YAML front matter `mode: action`, start `url`, `max_steps: 24`, an optional `@import` dismiss section, then one `##` heading per beat.

Per beat, Kane is given:

- **Type:** select field, replace with the exact value on its own line, type once, no quotes ([L492–L499](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L492-L499))
- **Click:** action + control label, click once, do not type, stay in tab ([L500–L502](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L500-L502))
- **Verify** lines from `success.urlContains` / `titleContains` / `visibleText` / `headingContains` ([L484–L488](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L484-L488))

[`persistTestMd`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L714-L717) can overwrite that file from an agent-edited markdown.

Required tools per action (`click` / `type`) come from [`requiredTools`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/beat-gates.ts#L10-L16).

### Author (`kane-cli testmd run`)

[`kaneTestmdRun`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L537-L669) is the feature that **is** the demo:

```text
kane-cli --local testmd run <job>/demo_test.md \
  --agent \
  --name demo-<shortId> \
  --timeout 180 \
  --max-steps 20 \
  [--local-context context.md] \
  [--variables-file variables.json] \
  [--cdp-endpoint http://127.0.0.1:<slotPort>]
```

`--name` tags the Kane run. `--local-context` injects understand notes. `--variables-file` injects secrets without putting them in markdown. When `cdpPort` is set and the worker is not on cloud Chrome, the spawn is wrapped in `runWithRecordedChrome` ([L576–L580](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L576-L580)).

After exit, the activity:

- writes `beat-timeline.json`
- harvests Kane screenshots from the evidence tree ([`harvestKaneVisuals`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L318))
- copies live JPEGs into `stills/beat-N`
- asserts Kane actually used click/type when the plan required it, and that “Create it free” reached a builder URL when asked ([L615–L634](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L615-L634))
- uploads `run_end.json`, session video if present, and the action log ([`publishKaneLog`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane-log.ts#L126-L143))

`--agent` is always on: Kane chooses controls from visible labels and heals, rather than replaying a selector script.

### CDP camera

[`runWithRecordedChrome`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/chrome-session.ts#L24-L104) launches Playwright `chromium.launchPersistentContext` with `--remote-debugging-port=<slot>`. Kane attaches to that port. The camera screenshots the painted page only. Headed vs headless is `KANE_HEADED=1` / `KANE_HEADLESS`. Linux adds `--no-sandbox`. If launch fails, Kane still runs without frames (assemble will then fail clearly).

Playwright is **not** a second clicker. Removing Kane would remove the product.

### Beat windows, harvest, and gates

| Helper | Role | Lines |
| --- | --- | --- |
| `eventHasTool` | Detect click/type in NDJSON | [`kane.ts` L356](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L356) |
| `assignBeatWindows` | Time-slice the session onto beats | [L363](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L363) |
| `harvestKaneVisuals` | Copy Kane evidence screenshots | [L318](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L318) |
| `unzipEvidence` | Open Kane failure zip for heal | [L256](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L256) |
| `tightenBeatGates` | Success checks that match reality | [`beat-gates.ts` L19–L43](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/beat-gates.ts#L19-L43) |
| `evaluateSuccess` | URL/title/text gates (shared) | [`schema.ts` L92](https://github.com/SamFelix03/demo.studio/blob/main/packages/shared/src/schema.ts#L92) |

`assembleDemo` prefers timed JPEGs ([`liveFilesForWindow`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/media.ts#L127)); if the live index is empty it falls back to harvested stills. Missing picture is `capture_failed` — the job does not ship a black video.

### NDJSON, action log, and the run console

Kane prints one JSON object per event. [`describeKaneEvent`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane-log.ts#L41-L60) turns that into `{ tool, text, status, url }` (heartbeats and skill pings dropped). [`appendKaneAction`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane-log.ts#L90-L105) appends human lines to `kane-actions.log` and raw events to `kane-actions.jsonl`. [`kaneEventHandler`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane-log.ts#L107-L124) also `emitEvent(..., "kane_step")` into Postgres.

Studio [`KaneConsole`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/components/KaneConsole.tsx) renders `kane_cmd`, `ndjson`, `kane_step`, and `heal`. [`showEvent`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/components/KaneConsole.tsx#L11-L18) hides slot acquire/release noise.

Artifacts `kane-log` and `kane-jsonl` are downloaded from `GET /v1/jobs/:id/artifacts/kane-log` (and `kane-jsonl`) via signed Supabase URLs ([`apps/api/src/server.ts` L119–L128](https://github.com/SamFelix03/demo.studio/blob/main/apps/api/src/server.ts#L119-L128)).

This is the agent loop in product form: Cursor Grok 4.6 writes the compiler and suite; Kane executes and streams NDJSON; the workflow and UI consume those events; a failed remark can rewrite the next beat ([`rewriteFailedBeat`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L671-L712)).

### Result codes and aborts

| Kane `result_code` | Job abort |
| --- | --- |
| 610 | captcha |
| 620 | paywall |
| 640 | access_denied |
| 650 | error_page |
| 660 | login_required (unless credentials present) |
| 550 | controller_auth |
| 560 | credits_exhausted |

Plus `final_state` booleans `has_captcha`, `has_bot_challenge`, `has_mfa`, `has_paywall`, `has_login_wall` ([`abortFromRunEnd`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/control.ts#L147-L167)). Pipeline copy for those states is in [`PipelineStage`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/components/PipelineStage.tsx#L75-L113).

### Evidence rewrite

[`rewriteFailedBeat`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L671-L712) reads Kane’s evidence zip, finds `failure.yaml`, matches the failed remark to a beat, and appends a more specific instruction (header vs footer, dismiss cookies, `result_code` 320 → different path). It emits a `heal` event the console shows as before → after. That is Kane’s failure driving the next action text.

### Per-beat `run` helper

[`kaneRecordBeats`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L736-L819) issues one `kane-cli run` per beat with [`beatObjective`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L720-L734) (“you are already on this URL, one action only”). It is **not** the live film path (it would reload state). It remains the Kane `run` API wrapper if a job needs isolated objectives. Production `KaneDemoWorkflow` uses TestMD instead.

### Studio TestMD suite

Committed files under [`kane/`](kane/): `studio_landing_test.md`, `studio_wizard_test.md`, `studio_validation_test.md`, `studio_gallery_test.md`, `api_health_test.md`, smoke `studio_test.md`, plus helpers `open_generate.md` and `dismiss_chrome.md`. Store-as lines (`launch_heading`, `wizard_url`, `url_required_message`, `default_product`, `gallery_heading`, `health_ok`) are the studio-verify observables. Coverage table, gate, and proof: [Kane CLI verification](#kane-cli-verification).

```bash
npm run test:kane
npm run test:studio-verify
npm run verify:baseline
npm run verify -- --all
```

## Studio UI

| Surface | File | What Kane-related work it does |
| --- | --- | --- |
| Shell / nav | [`apps/studio/src/App.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/App.tsx) | Gallery, Generate, Pitch, Verified |
| Wizard | [`apps/studio/src/pages/Home.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/pages/Home.tsx) | `walkthrough` + numbered `Step N:` script, Kane-only job create |
| Job | [`apps/studio/src/pages/Job.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/pages/Job.tsx) | Pipeline, console, video, cancel, log/caption downloads |
| Gallery | [`apps/studio/src/pages/Gallery.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/pages/Gallery.tsx) | Completed MP4 tiles |
| Pitch | [`apps/studio/src/pages/Pitch.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/pages/Pitch.tsx) | Lane 3 film + stop-hook / verified slide |
| Verified | [`apps/studio/src/pages/Verified.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/pages/Verified.tsx) | Blocked / green Kane reports for the Studio gate |
| Pipeline | [`apps/studio/src/components/PipelineStage.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/components/PipelineStage.tsx) | health → preflight → understand → plan → tts → author → seal |
| Console | [`apps/studio/src/components/KaneConsole.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/components/KaneConsole.tsx) | Live Kane steps |
| Proxy | [`apps/studio/vite.config.ts`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/vite.config.ts#L6) | `/v1` and `/health` → `:4031` |

## HTTP API

Implemented in [`apps/api/src/server.ts`](https://github.com/SamFelix03/demo.studio/blob/main/apps/api/src/server.ts).

| Method | Path | Role |
| --- | --- | --- |
| `GET` | `/health` | Postgres ping, Temporal address, free Chrome slots |
| `GET` | `/v1/verified` | Live `last-verify.json` plus committed blocked/verified snapshots and baseline |
| `POST` | `/v1/jobs` | Create Kane job, start `KaneDemoWorkflow` |
| `GET` | `/v1/jobs` | List |
| `GET` | `/v1/jobs/:id` | Job + signed artifact URLs |
| `GET` | `/v1/jobs/:id/events` | JSON or SSE (`Accept: text/event-stream`) |
| `GET` | `/v1/jobs/:id/artifacts/:kind` | Redirect to signed object (`video`, `kane-log`, `captions`, …) |
| `POST` | `/v1/jobs/:id/confirm-script` | Signal edited beats |
| `POST` | `/v1/jobs/:id/cancel` | Temporal cancel |

Optional header `Idempotency-Key`. Body `mode` is `kane`. `input` follows [`jobInputSchema`](https://github.com/SamFelix03/demo.studio/blob/main/packages/shared/src/schema.ts): `website_url`, `script`, optional `walkthrough` (locked on-screen actions), optional `beats`, `product_name`, `credentials`, `voice`, `viewport`, `require_script_confirm`, `i_have_right_to_record`.

## Workers, storage, and data

- Worker: [`apps/worker/src/main.ts`](https://github.com/SamFelix03/demo.studio/blob/main/apps/worker/src/main.ts) — queues `control`, `kane-chrome`, `media`.
- Workflows: [`packages/workflows/src/index.ts`](https://github.com/SamFelix03/demo.studio/blob/main/packages/workflows/src/index.ts) — `KaneDemoWorkflow` only.
- DB: [`packages/shared/src/db.ts`](https://github.com/SamFelix03/demo.studio/blob/main/packages/shared/src/db.ts) — jobs, events, [`acquireSlot` / `releaseSlot`](https://github.com/SamFelix03/demo.studio/blob/main/packages/shared/src/db.ts#L189-L218).
- Objects: [`packages/shared/src/storage.ts`](https://github.com/SamFelix03/demo.studio/blob/main/packages/shared/src/storage.ts) — keys `demo-studio/kane/<jobId>/…` ([`prefix` L6–L8](https://github.com/SamFelix03/demo.studio/blob/main/packages/shared/src/storage.ts#L6-L8)).
- Config: [`packages/shared/src/config.ts`](https://github.com/SamFelix03/demo.studio/blob/main/packages/shared/src/config.ts).
- Migrate: `npm run migrate` → [`packages/shared/src/migrate.ts`](https://github.com/SamFelix03/demo.studio/blob/main/packages/shared/src/migrate.ts).

## Configuration

See [`env.example`](env.example).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres |
| `TEMPORAL_ADDRESS` / `TEMPORAL_NAMESPACE` | Workflow server |
| `API_PORT` / `PUBLIC_API_BASE_URL` | API bind and public links |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET` | Artifact store |
| `LMNT_API_KEY` / `LMNT_VOICE` | Cloud narration |
| `KANE_WS_ENDPOINT` | Empty = local Chrome; set for Kane cloud browser |
| `KANE_USERNAME` / `KANE_ACCESS_KEY` / `KANE_PROJECT_ID` | Worker login when whoami fails |
| `GEMINI_API_KEY` / `GEMINI_TEXT_MODEL` | Fallback planner |
| `KANE_HEADLESS` / `KANE_HEADED` | Camera + Kane headedness |
| `WORKER_IDENTITY` | Slot lease owner |

## Example run

Committed payload and Kane output for surveys.free (Birthday RSVP: type title, Create it free, description, first question, Yes/no, allergies + Required, Save):

- Job shape: [`docs/kane-runs/surveys-free-job.json`](docs/kane-runs/surveys-free-job.json)
- Human Kane log: [`docs/kane-runs/surveys-free-form-builder.log`](docs/kane-runs/surveys-free-form-builder.log)
- Raw NDJSON: [`docs/kane-runs/surveys-free-form-builder.jsonl`](docs/kane-runs/surveys-free-form-builder.jsonl)

Those files are what Kane did in the browser, separate from TTS and ffmpeg.

## Optional Docker and Railway

**Deployed on Railway**

| | |
| --- | --- |
| Studio | https://studio-production-d6af.up.railway.app/ |
| Pitch | https://studio-production-d6af.up.railway.app/pitch |
| Verified | https://studio-production-d6af.up.railway.app/verified |
| API | https://api-production-27b6.up.railway.app/health |

[`infra/docker-compose.yml`](infra/docker-compose.yml) can run Postgres + Temporal if you do not already have them locally. Docker is not required for local Node + Temporal CLI.

Railway-style split (Dockerfiles at repo root):

| Service | Dockerfile | Notes |
| --- | --- | --- |
| `api` | `Dockerfile.api` | Migrations on boot; public URL above |
| `worker` | `Dockerfile.worker` | Playwright, ffmpeg, `kane-cli`, LMNT TTS; 2 GB+ RAM |
| `studio` | `Dockerfile.studio` | Nginx; `API_UPSTREAM` → private API host |
| `temporal` | `Dockerfile.temporal` | `temporalio/auto-setup` on the Railway Postgres |

Share `DATABASE_URL`, Temporal, Supabase, LMNT (`LMNT_VOICE` e.g. `violet`), Kane login, Gemini, `KANE_HEADLESS=1`, `KANE_CLI_SYSTEM_NODE=1` on api and worker. Do not use macOS screen capture on Linux workers; the CDP JPEG camera is the film.

## Repository layout

```text
apps/api               Fastify job API (includes GET /v1/verified)
apps/worker            Temporal workers
apps/studio            Generate / job / gallery / pitch / verified
packages/shared        Config, Zod, Postgres, Supabase
packages/activities    Kane spawn, TestMD, CDP camera, TTS, ffmpeg
packages/workflows     KaneDemoWorkflow
packages/studio-verify Kane NDJSON parse, baseline compare, Cursor stop hook
kane/                  Committed TestMD (Studio suite + job helpers)
.studio-verify/        Flow map, config, trusted baseline (live runs gitignored)
.cursor/               Stop hook → studio-verify
docs/kane-runs/        Product logs, Studio e2e results, verify proof
infra/                 Optional compose; nginx SPA routes for /pitch and /verified
env.example            Template (copy to .env)
```
