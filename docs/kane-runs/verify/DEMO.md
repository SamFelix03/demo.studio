# Scoring drill — Kane blocks Cursor, Cursor fixes Studio

The product on `main` stays green. This is a **local, reversible** Continue-submit regression so we can film: Kane fails, the Cursor stop hook refuses to end the turn, the agent restores `Home.tsx`, Kane goes green.

Do **not** tell Cursor “fix the Continue bug.” That lets it patch from the prompt and skip Kane.

## Preconditions

- Studio on `:5173`, API on `:4031`
- `kane-cli` logged in (`.env` `KANE_USERNAME` / `KANE_ACCESS_KEY`)
- Trusted baseline exists: `npm run verify:baseline`
- Working tree otherwise clean

```bash
npm run verify:status
```

## The loop

1. **Plant (scripted, reliable)**

   ```bash
   npm run verify:plant
   ```

   Continue becomes `type="submit"` and loses `onClick={next}` on **every** wizard step. Kane’s first Continue (Site → Brief) does nothing; the run fails at **Site to Brief**. The form still `preventDefault`s, so Kane does **not** POST a Generate job.

   Or prompt Cursor instead: *On Access, make Continue the form’s submit button and drop the stage click handler — Enter should submit the wizard.*

2. **Let the agent try to stop.** [`.cursor/hooks.json`](../../../.cursor/hooks.json) runs `studio-verify hook`. `Home.tsx` maps to `wizard` (and landing / validation). Kane runs [`kane/studio_wizard_test.md`](../../../kane/studio_wizard_test.md). Continue never advances; Kane fails at Site to Brief (or Access → Launch if only that step were broken).

3. **Cursor receives `followup_message`.** Repair the app, not the TestMD, not the baseline. Restore `type="button"` and `onClick={next}`.

4. **Stop again.** Kane matches `.studio-verify/baseline.json`. The agent may finish.

5. **Keep the proof** (after a blocked run and a green run):

   ```bash
   cp .studio-verify/last-verify.json docs/kane-runs/verify/blocked-run.json   # while still blocked
   cp .studio-verify/last-verify.json docs/kane-runs/verify/verified-run.json  # after restore
   cp .studio-verify/runs/verify-wizard.ndjson docs/kane-runs/verify/verify-wizard-blocked.ndjson
   cp docs/kane-runs/verify/*.json apps/studio/public/verified/
   ```

6. **Restore if you used the plant script and the agent did not:**

   ```bash
   npm run verify:restore
   ```

Never commit the planted `Home.tsx`.

## What not to plant

- Do not wire `onSubmit={submit}` without the stage guard — that enqueues a real surveys.free demo job.
- Do not plant in `packages/activities`. The suite does not click Generate; Lane 3 stays the product.
