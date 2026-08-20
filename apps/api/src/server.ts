import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { Client, Connection } from "@temporalio/client";
import {
  countFreeSlots,
  createJobBodySchema,
  ensureBucket,
  findByIdempotency,
  getJob,
  getPool,
  insertJob,
  listChildJobs,
  listEvents,
  listJobs,
  loadConfig,
  loadDotEnv,
  signedUrl,
  sanitizeInputForDb,
  updateJob,
  beatSchema,
} from "@demo-studio/shared";

import { KaneDemoWorkflow, confirmScriptSignal } from "@demo-studio/workflows";

loadDotEnv();
const cfg = loadConfig();
const db = getPool(cfg.databaseUrl);

async function temporal() {
  let last: unknown;
  for (let i = 0; i < 40; i++) {
    try {
      const connection = await Connection.connect({ address: cfg.temporalAddress });
      return new Client({ connection, namespace: cfg.temporalNamespace });
    } catch (err) {
      last = err;
      console.error(`temporal ${cfg.temporalAddress} not ready (${i + 1}/40)`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw last;
}

async function refreshArtifacts(job: NonNullable<Awaited<ReturnType<typeof getJob>>>) {
  const artifacts = [];
  for (const a of job.artifacts) {
    if (a.object_key) {
      artifacts.push({
        ...a,
        url: await signedUrl(a.object_key),
      });
    } else {
      artifacts.push(a);
    }
  }
  return { ...job, artifacts };
}

async function main() {
  await ensureBucket(cfg);
  const client = await temporal();
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  app.get("/health", async () => {
    let dbOk = false;
    try {
      await db.query("SELECT 1");
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const slots = dbOk ? await countFreeSlots(db) : 0;
    return {
      ok: dbOk,
      database: dbOk,
      temporal: cfg.temporalAddress,
      slots_free: slots,
    };
  });

  app.post("/v1/jobs", async (req, reply) => {
    const parsed = createJobBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { input, parent_job_id } = parsed.data;
    const mode = "kane" as const;
    const sample = cfg.sampleAppUrl.replace(/\/$/, "");
    if (!input.website_url.startsWith(sample) && !input.i_have_right_to_record) {
      return reply.code(400).send({
        error: "i_have_right_to_record is required for third-party URLs",
      });
    }
    const idem =
      (req.headers["idempotency-key"] as string | undefined) ||
      (req.headers["x-idempotency-key"] as string | undefined);
    if (idem) {
      const existing = await findByIdempotency(db, "demo-studio", `${mode}:${idem}`);
      if (existing) return reply.code(200).send(existing);
    }
    const { stored, secrets } = sanitizeInputForDb(input);
    const id = randomUUID();
    const job = await insertJob(db, {
      id,
      mode,
      input: stored as typeof input,
      idempotency_key: idem ? `${mode}:${idem}` : undefined,
      parent_job_id,
    });
    const workflowId = `demo-${mode}-${id}`;
    await updateJob(db, id, { workflow_id: workflowId, status: "queued" });
    void (await client.workflow.start(KaneDemoWorkflow, {
      taskQueue: "control",
      workflowId,
      args: [
        {
          jobId: id,
          input: { ...input, credentials: secrets },
          hasCredentials: Boolean(secrets?.username || secrets?.password),
        },
      ],
      workflowRunTimeout: "2 hours",
    }));
    return reply.code(201).send(await getJob(db, id));
  });

  app.get("/v1/jobs/:id/artifacts/:kind", async (req, reply) => {
    const { id, kind } = req.params as { id: string; kind: string };
    const job = await getJob(db, id);
    if (!job) return reply.code(404).send({ error: "not found" });
    const art = job.artifacts.find(
      (a) => a.type === kind || a.object_key?.endsWith(`/${kind}`),
    );
    if (!art?.object_key) return reply.code(404).send({ error: "artifact not found" });
    const url = await signedUrl(art.object_key);
    return reply.redirect(url);
  });

  app.post("/v1/jobs/:id/confirm-script", async (req, reply) => {
    const parsed = beatSchema
      .array()
      .safeParse((req.body as { beats?: unknown })?.beats);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const job = await getJob(db, (req.params as { id: string }).id);
    if (!job?.workflow_id) return reply.code(404).send({ error: "not found" });
    await client.workflow.getHandle(job.workflow_id).signal(confirmScriptSignal, parsed.data);
    await updateJob(db, job.id, { input: { ...job.input, beats: parsed.data } });
    return { ok: true };
  });

  app.get("/v1/jobs", async (req) => {
    const q = req.query as { mode?: string; status?: string; limit?: string };
    const jobs = await listJobs(db, {
      mode: q.mode as "kane" | "naive" | undefined,
      status: q.status as never,
      limit: q.limit ? Number(q.limit) : 50,
    });
    return { jobs };
  });

  app.get("/v1/jobs/:id", async (req, reply) => {
    const job = await getJob(db, (req.params as { id: string }).id);
    if (!job) return reply.code(404).send({ error: "not found" });
    const kids = await listChildJobs(db, job.id);
    const compare = kids[0] ? await refreshArtifacts(kids[0]) : null;
    return { ...(await refreshArtifacts(job)), compare };
  });

  app.get("/v1/jobs/:id/events", async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { after?: string };
    const wantsSse = (req.headers.accept ?? "").includes("text/event-stream");
    if (!wantsSse) {
      return { events: await listEvents(db, id, Number(q.after ?? 0)) };
    }
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    let after = Number(q.after ?? 0);
    const tick = async () => {
      const events = await listEvents(db, id, after);
      for (const e of events) {
        after = e.seq;
        reply.raw.write(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`);
      }
    };
    await tick();
    const iv = setInterval(() => void tick(), 1000);
    req.raw.on("close", () => clearInterval(iv));
  });

  app.post("/v1/jobs/:id/cancel", async (req, reply) => {
    const job = await getJob(db, (req.params as { id: string }).id);
    if (!job?.workflow_id) return reply.code(404).send({ error: "not found" });
    const handle = client.workflow.getHandle(job.workflow_id);
    await handle.cancel();
    await updateJob(db, job.id, { status: "cancelled", error: "cancelled by user" });
    return { ok: true };
  });

  app.listen({ port: cfg.apiPort, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
