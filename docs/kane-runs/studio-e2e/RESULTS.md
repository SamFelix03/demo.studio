# Kane CLI verification — 21 August 2026

demo.studio uses Kane CLI in two places:

1. **Product path** — `KaneDemoWorkflow` authors a walkthrough of a live third-party site (`kane-cli run` + `kane-cli testmd run`).
2. **App path** — committed TestMD under [`kane/`](../../kane) walks Studio and the health API with the same CLI.

This folder is the record of (2), plus pointers to (1).

## How to re-run

Studio on `:5173` and API on `:4031` must already be up. `kane/run-suite.sh` logs in with `KANE_USERNAME` / `KANE_ACCESS_KEY` from `.env`.

```bash
npm run test:kane
```

Each member is `kane-cli --local testmd run <file> --agent --headless`. These tests do not click Generate, so they do not start a second Kane job.

## Suite (re-run 21 Aug 2026, Kane CLI 0.8.4, `--local --headless --agent`)

Logged in from `.env`. **All six tests passed** (`SUITE_EXIT=0`). See [`summary.txt`](summary.txt).

| Test | File | Result | Duration | Session |
| --- | --- | --- | --- | --- |
| API health JSON | [`kane/api_health_test.md`](../../kane/api_health_test.md) | **passed** | 53s | `6d865513-32f5-4665-8134-e41c8c6393b5` |
| Landing + branding + Site defaults | [`kane/studio_landing_test.md`](../../kane/studio_landing_test.md) | **passed** | 56s | `64a1745b-66ad-4c81-b8c7-b15ae30a3a3e` |
| Smoke: landing, Brief actions, Gallery | [`kane/studio_test.md`](../../kane/studio_test.md) | **passed** | 109s | `ff8f0d80-8f27-4fb7-ae74-9181c022a9d3` |
| Wizard Site → Brief → Access → Launch | [`kane/studio_wizard_test.md`](../../kane/studio_wizard_test.md) | **passed** | 137s | `b81c7c53-8be9-4a9e-b6ef-382ec5654094` |
| Empty URL validation | [`kane/studio_validation_test.md`](../../kane/studio_validation_test.md) | **passed** | 76s | `088091be-27bb-444f-b419-e10e400407fe` |
| Gallery + optional job tile | [`kane/studio_gallery_test.md`](../../kane/studio_gallery_test.md) | **passed** | 147s | `3ff11b02-d329-4407-a065-8e47aa2582a8` |

## What Kane confirmed

- `GET /health` shows `ok`, `database`, `temporal`, `slots_free`.
- Generate branding: `demo.studio`, Kane CLI, Site defaults for surveys.free.
- Brief shows On-screen actions and Create it free.
- Wizard reaches Launch (“Ready to record”) without POSTing a job.
- Empty Website URL stays on Site.
- Demo Gallery lists Kane jobs; optional job tile opens a run console.

## Earlier finding (already fixed, re-verified green)

Continue on Access used to submit Generate in the same click (`type="submit"`). Generate is `type="button"`; this re-run passed Launch without creating a job.

## Advisory (not a product bug)

Gallery’s optional job step logged an unconfirmed *automation* note: a job-URL check ran after Kane had already returned to the list. The test file now asserts the job URL **before** clicking Demo Gallery. The product was not wrong; the suite still passed.

## Product path (Kane as the hands on surveys.free)

- [`docs/kane-runs/surveys-free-job.json`](../surveys-free-job.json)
- [`docs/kane-runs/surveys-free-form-builder.log`](../surveys-free-form-builder.log)
- [`docs/kane-runs/surveys-free-form-builder.jsonl`](../surveys-free-form-builder.jsonl)
