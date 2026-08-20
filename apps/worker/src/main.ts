import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "@demo-studio/activities";
import { loadConfig, loadDotEnv, TASK_QUEUES } from "@demo-studio/shared";

loadDotEnv(); // live jpeg camera, not blank webm

const workflowsPath = fileURLToPath(
  new URL("../../../packages/workflows/src/index.ts", import.meta.url),
);

async function run() {
  const cfg = loadConfig();
  const connection = await NativeConnection.connect({ address: cfg.temporalAddress });
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
