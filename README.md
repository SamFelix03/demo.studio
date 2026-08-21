# demo.studio

The feature is done — then you still have to click through it on camera so everyone else can see it. At a hackathon, judges want a demo, so the last hour goes to recording instead of shipping. Thousands of builders face the same gap between *built* and *shown*.

That’s why we built **[demo.studio](https://studio-production-d6af.up.railway.app/)**: give a URL, a goal, who’s watching, and the on-screen actions — get a narrated **demo.mp4** of the live product. [Kane CLI](https://www.testmuai.com/support/docs/kane-cli-introduction/) is the hands on the page (and the agent that tests Studio end to end). Don’t record the walkthrough. Let Kane walk it.

Live app: [studio-production-d6af.up.railway.app](https://studio-production-d6af.up.railway.app/) · Pitch: [/pitch](https://studio-production-d6af.up.railway.app/pitch). Clone this repo and follow [Quick start](#quick-start) to run the same stack locally. Watch the demo on [YouTube](https://www.youtube.com/watch?v=NlvFnU8O-b8)

## Table of contents

- [What it is](#what-it-is)
- [Who it is for](#who-it-is-for)
- [Lane 3](#lane-3)
- [Important links](#important-links)
- [Built with](#built-with)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Kane CLI verification](#kane-cli-verification)
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
- A committed TestMD suite also drives **Studio itself**, so Kane can walk the generator UI the same way it walks a third-party site.

## Important links

| | |
| --- | --- |
| **Demo video** | https://www.youtube.com/watch?v=NlvFnU8O-b8 |
| **Live Studio** | https://studio-production-d6af.up.railway.app/ |
| **Pitch deck** | https://studio-production-d6af.up.railway.app/pitch |
| **API health** | https://api-production-27b6.up.railway.app/health |

## Built with

This codebase was written in **Cursor**, using the **Cursor Grok 4.6** model, with Kane CLI as the browser runtime the agent calls.

| Service / tool | Purpose in demo.studio |
| --- | --- |
| **Kane CLI** (`kane-cli`) | Browser agent: login, credits, `run`, `generate`, `testmd run`, NDJSON, result codes, evidence zips. |
| **Cursor (Grok 4.6)** | Authored the monorepo, workflows, TestMD compiler, Studio UI, and the Studio TestMD suite. |
| **Temporal** | Durable `KaneDemoWorkflow`: slots, retries, heartbeats, cancel. |
| **PostgreSQL** | Jobs, event log, Chrome slot leases. |
| **Supabase Storage** | Private bucket for MP4, captions, TestMD, Kane logs, stills metadata. |
| **Google Gemini** | Optional beat planner when the brief is not already numbered `Step N:`. |
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

Walk Studio with Kane (Studio must already be serving):

```bash
npm run test:kane
# or a single file:
kane-cli --local testmd run kane/studio_test.md --agent --headless
```

Results from the 21 August 2026 run are in [`docs/kane-runs/studio-e2e/RESULTS.md`](docs/kane-runs/studio-e2e/RESULTS.md).

## Kane CLI verification

Kane CLI is both the **runtime** that films a third-party site and the **checker** that walks demo.studio itself. Cursor Grok 4.6 wrote the TestMD; Kane executed it in Chrome.

| Layer | What Kane does |
| --- | --- |
| Product | `KaneDemoWorkflow` → `kane-cli run` / `testmd run` on the customer URL (example: surveys.free form builder). |
| Studio | Committed `kane/*_test.md` files against localhost Generate, Gallery, and `/health`. |

**Latest run** (21 August 2026, `kane-cli` 0.8.4, `.env` credentials, `--local --headless --agent`): **6 / 6 passed**.

| Test | Result |
| --- | --- |
| [`kane/api_health_test.md`](kane/api_health_test.md) | passed — health JSON |
| [`kane/studio_landing_test.md`](kane/studio_landing_test.md) | passed — branding and Site defaults |
| [`kane/studio_test.md`](kane/studio_test.md) | passed — Brief + Gallery |
| [`kane/studio_wizard_test.md`](kane/studio_wizard_test.md) | passed — Launch without auto-submit |
| [`kane/studio_validation_test.md`](kane/studio_validation_test.md) | passed — empty URL stays on Site |
| [`kane/studio_gallery_test.md`](kane/studio_gallery_test.md) | passed — library + job tile |

An earlier run found Continue submitting Generate; that is fixed and this run stayed on Launch. Details: [`docs/kane-runs/studio-e2e/RESULTS.md`](docs/kane-runs/studio-e2e/RESULTS.md).

The surveys.free **product** walkthrough (Kane as hands on the live form builder) is unchanged: [`docs/kane-runs/surveys-free-form-builder.log`](docs/kane-runs/surveys-free-form-builder.log).

## How it works

### What the operator does

Studio is a four-step wizard ([`apps/studio/src/pages/Home.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/pages/Home.tsx)):

1. **Site** — `website_url` and `product_name`.
2. **Brief** — goal, audience, outcome, and an ordered list of on-screen actions.
3. **Access** — optional username/password (stored redacted in Postgres; secrets are passed only into the workflow args).
4. **Launch** — attestation, then `POST /v1/jobs`.

`composeScript` ([L22–L32](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/pages/Home.tsx#L22-L32)) folds goal, audience, outcome, and actions into one `script` string whose walkthrough section is **`Step 1: … Step 2: …`**. That numbering is the contract between the UI and the planner. Submit always sends `mode: "kane"` ([L92–L108](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/pages/Home.tsx#L92-L108)).

The API validates the body ([`createJobBodySchema`](https://github.com/SamFelix03/demo.studio/blob/main/packages/shared/src/schema.ts#L68-L71)), redacts credentials ([`sanitizeInputForDb`](https://github.com/SamFelix03/demo.studio/blob/main/packages/shared/src/schema.ts#L73-L90)), inserts the job ([`insertJob`](https://github.com/SamFelix03/demo.studio/blob/main/packages/shared/src/db.ts#L47)), and starts Temporal workflow `KaneDemoWorkflow` ([`apps/api/src/server.ts` L73–L117](https://github.com/SamFelix03/demo.studio/blob/main/apps/api/src/server.ts#L73-L117)).

### Job lifecycle

The entire product path is [`KaneDemoWorkflow`](https://github.com/SamFelix03/demo.studio/blob/main/packages/workflows/src/index.ts#L93-L200). Activities are split across Temporal queues so Chrome work, planning, and ffmpeg do not block each other ([`packages/workflows/src/queues.ts`](https://github.com/SamFelix03/demo.studio/blob/main/packages/workflows/src/queues.ts), worker [L12–L20](https://github.com/SamFelix03/demo.studio/blob/main/apps/worker/src/main.ts#L12-L20)).

```text
Studio brief  →  POST /v1/jobs  →  KaneDemoWorkflow
                                      │
                   toolingHealth      │  kane-cli whoami / login / balance / config
                   Chrome slot        │  lease a local debugging port
                   kanePreflight      │  kane-cli run  (walls, CAPTCHA, login)
                   kaneUnderstand     │  kane-cli run  (nav, fields, CTAs → context.md)
                   planDemoBeats      │  numbered script or Gemini
                   [optional signal]  │  confirm-script
                   synthesizeBeats    │  LMNT or say → WAV per beat
                   compileTestMd      │  demo_test.md + helpers
                   kaneTestmdRun      │  kane-cli testmd run --agent  (same Chrome)
                   assembleDemo       │  JPEG windows × WAV → MP4 → Supabase
```

Step by step, matching workflow lines:

1. **`health`** — [`toolingHealth`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/control.ts#L23-L71) proves `kane-cli` is on PATH and authenticated. [`acquireChromeSlot`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/control.ts#L73-L90) leases a debugging port so two jobs do not share a profile.
2. **`preflight`** — [`kanePreflight`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L50-L128) runs Kane on the start URL with a store-and-assert objective (cookie banner, CAPTCHA, Cloudflare, login wall, MFA, paywall). [`abortFromRunEnd`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/control.ts#L136-L169) maps Kane `result_code` and `final_state` into a non-retryable abort the UI can show.
3. **`understand`** — [`kaneUnderstand`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L130-L197) runs a second `kane-cli run` that **stores** live labels (`nav_items`, `hero_cta`, `inputs`, …) into Kane `final_state`, then writes `context.md` and `variables.json` for later TestMD. The Chrome slot is released so planning/TTS do not hold a browser.
4. **`plan`** — [`planDemoBeats`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/plan.ts#L240-L302). If the job already has `beats`, those win. Else [`beatsFromNumberedScript`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/plan.ts#L31-L53) parses `Step N:`. Else Gemini ([`geminiPlan`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/plan.ts#L181-L237)) using the understand inventory. [`tightenBeatGates`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/beat-gates.ts#L19-L43) rewrites success checks so a click is not “verified” by text that was already on the homepage.
5. **`await_script` (optional)** — if `require_script_confirm`, the workflow waits on [`confirmScriptSignal`](https://github.com/SamFelix03/demo.studio/blob/main/packages/workflows/src/index.ts#L27) until `POST /v1/jobs/:id/confirm-script`.
6. **`tts`** — [`synthesizeBeats`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/media.ts#L284-L346) synthesizes each beat’s `narration` to WAV and records durations. Those durations are the edit list for the film.
7. **`author`** — a second Chrome slot. [`compileTestMd`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L468-L535) writes `demo_test.md`. [`kaneTestmdRun`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L537-L669) runs **one** `testmd run --agent` while [`runWithRecordedChrome`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/chrome-session.ts#L29-L104) JPEG-captures the painted tab.
8. **`upload`** — [`assembleDemo`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/media.ts#L348-L537) slices stills per beat window, muxes each slice to that beat’s WAV ([`sealBeat`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/media.ts#L226)), concatenates, uploads `demo.mp4` / captions / timeline, and marks the job completed.

The job page ([`apps/studio/src/pages/Job.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/pages/Job.tsx)) polls job JSON and `/v1/jobs/:id/events`, renders [`PipelineStage`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/components/PipelineStage.tsx#L7-L15) and [`KaneConsole`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/components/KaneConsole.tsx), and can cancel via Temporal ([`POST /v1/jobs/:id/cancel`](https://github.com/SamFelix03/demo.studio/blob/main/apps/api/src/server.ts#L187-L193)).

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
| `testmd run kane/studio_test.md --agent` | Walk Studio UI | [`kane/studio_test.md`](https://github.com/SamFelix03/demo.studio/blob/main/kane/studio_test.md) |

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
- `final_state` returned to the planner

This is how Kane enables planning: Gemini (or the numbered-script path) sees **labels Kane actually read**, not a hallucinated sitemap.

### Generate (`kane-cli generate`)

[`kaneGenerate`](https://github.com/SamFelix03/demo.studio/blob/main/packages/activities/src/kane.ts#L199-L244) calls Kane’s generator (`generate <prompt> --agent --url`), then `generate --save --req <request_id> --out <dir>` to pull the markdown. The live workflow compiles TestMD itself from beats; this helper is the Kane-native generator wired for the same job directory.

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

| File | Covers |
| --- | --- |
| [`kane/helpers/open_generate.md`](kane/helpers/open_generate.md) | Open `:5173`, stay on localhost |
| [`kane/studio_landing_test.md`](kane/studio_landing_test.md) | Branding, header, Site defaults |
| [`kane/studio_test.md`](kane/studio_test.md) | Smoke: Brief + Gallery |
| [`kane/studio_wizard_test.md`](kane/studio_wizard_test.md) | Site → Brief → Access → Launch (no Generate click) |
| [`kane/studio_validation_test.md`](kane/studio_validation_test.md) | Empty Website URL stays on Site |
| [`kane/studio_gallery_test.md`](kane/studio_gallery_test.md) | Gallery list and optional job tile |
| [`kane/api_health_test.md`](kane/api_health_test.md) | `GET /health` JSON |
| [`kane/helpers/dismiss_chrome.md`](kane/helpers/dismiss_chrome.md) | Cookie/consent helper used by generated job TestMD |

```bash
npm run test:kane
```

## Studio UI

| Surface | File | What Kane-related work it does |
| --- | --- | --- |
| Shell / nav | [`apps/studio/src/App.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/App.tsx) | Gallery + Generate; pixel `demo.studio` wordmark |
| Wizard | [`apps/studio/src/pages/Home.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/pages/Home.tsx) | Numbered script, Kane-only job create, TestMu + Kane “Powered by” |
| Job | [`apps/studio/src/pages/Job.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/pages/Job.tsx) | Pipeline, console, video, cancel, log/caption downloads |
| Gallery | [`apps/studio/src/pages/Gallery.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/pages/Gallery.tsx) | Completed MP4 tiles |
| Pipeline | [`apps/studio/src/components/PipelineStage.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/components/PipelineStage.tsx) | health → preflight → understand → plan → tts → author → seal |
| Console | [`apps/studio/src/components/KaneConsole.tsx`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/src/components/KaneConsole.tsx) | Live Kane steps |
| Proxy | [`apps/studio/vite.config.ts`](https://github.com/SamFelix03/demo.studio/blob/main/apps/studio/vite.config.ts#L6) | `/v1` and `/health` → `:4031` |

## HTTP API

Implemented in [`apps/api/src/server.ts`](https://github.com/SamFelix03/demo.studio/blob/main/apps/api/src/server.ts).

| Method | Path | Role |
| --- | --- | --- |
| `GET` | `/health` | Postgres ping, Temporal address, free Chrome slots ([L56–L71](https://github.com/SamFelix03/demo.studio/blob/main/apps/api/src/server.ts#L56-L71)) |
| `POST` | `/v1/jobs` | Create Kane job, start `KaneDemoWorkflow` ([L73](https://github.com/SamFelix03/demo.studio/blob/main/apps/api/src/server.ts#L73)) |
| `GET` | `/v1/jobs` | List |
| `GET` | `/v1/jobs/:id` | Job + signed artifact URLs |
| `GET` | `/v1/jobs/:id/events` | JSON or SSE (`Accept: text/event-stream`) |
| `GET` | `/v1/jobs/:id/artifacts/:kind` | Redirect to signed object (`video`, `kane-log`, `captions`, …) |
| `POST` | `/v1/jobs/:id/confirm-script` | Signal edited beats |
| `POST` | `/v1/jobs/:id/cancel` | Temporal cancel |

Optional header `Idempotency-Key`. Body `mode` is `kane`. `input` follows [`jobInputSchema`](https://github.com/SamFelix03/demo.studio/blob/main/packages/shared/src/schema.ts#L35-L66): `website_url`, `script`, optional `beats`, `product_name`, `credentials`, `voice`, `viewport`, `require_script_confirm`, `i_have_right_to_record`.

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
apps/api            Fastify job API
apps/worker         Temporal workers
apps/studio         Generate / job / gallery
packages/shared     Config, Zod, Postgres, Supabase
packages/activities Kane spawn, TestMD, CDP camera, TTS, ffmpeg
packages/workflows  KaneDemoWorkflow
- `kane/` committed TestMD (Studio suite + job helpers)
- `docs/kane-runs/` Kane product logs and Studio e2e results
infra/              Optional compose
env.example         Template (copy to .env)
```
