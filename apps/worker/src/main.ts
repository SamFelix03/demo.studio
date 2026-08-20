import http from "node:http";
import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "@demo-studio/activities";
import { loadConfig, loadDotEnv, TASK_QUEUES } from "@demo-studio/shared";

loadDotEnv(); // live jpeg camera, not blank webm

const workflowsPath = fileURLToPath(
  new URL("../../../packages/workflows/src/index.ts", import.meta.url),
);

function listenHealth() {
  const port = Number(process.env.PORT ?? 4099);
  http
    .createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, role: "worker" }));
    })
    .listen(port, "0.0.0.0", () => {
      console.log("worker health listening", port);
    });
}

async function connectTemporal(address: string) {
  let last: unknown;
  for (let i = 0; i < 40; i++) {
    try {
      return await NativeConnection.connect({ address });
    } catch (err) {
      last = err;
      console.error(`temporal ${address} not ready (${i + 1}/40)`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw last;
}

async function run() {
  listenHealth();
  const cfg = loadConfig();
  const connection = await connectTemporal(cfg.temporalAddress);
  const queues = [TASK_QUEUES.control, TASK_QUEUES.kane, TASK_QUEUES.media];
  const workers = await Promise.all(
    queues.map((taskQueue) =>
      Worker.create({
        connection,
        namespace: cfg.temporalNamespace,
        taskQueue,
        workflowsPath,
        activities,
      }),
    ),
  );
  console.log("Demo Studio workers listening", queues.join(", "));
  await Promise.all(workers.map((w) => w.run()));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
