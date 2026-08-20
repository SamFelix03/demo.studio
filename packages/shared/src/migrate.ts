import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadConfig, loadDotEnv, pgSsl } from "./index.js";

loadDotEnv();

async function tryCreateDatabase(databaseUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl.replace(/^postgres(ql)?:\/\//, "http://"));
  } catch {
    return;
  }
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("?")[0] ?? "");
  if (!dbName || dbName === "postgres") return;

  const adminUrl = databaseUrl.replace(/\/[^/?]+(\?.*)?$/, "/postgres$1");
  if (adminUrl === databaseUrl) return;

  const admin = new pg.Client({ connectionString: adminUrl, ssl: pgSsl(adminUrl) });
  try {
    await admin.connect();
    const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (!exists.rowCount) {
      await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log("created database", dbName);
    }
  } catch (err) {
    console.log("skip CREATE DATABASE (using provisioned database):", (err as Error).message);
  } finally {
    try {
      await admin.end();
    } catch {
      /* ignore */
    }
  }
}

async function migrate() {
  const cfg = loadConfig();
  await tryCreateDatabase(cfg.databaseUrl);

  const sqlPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../infra/schema.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const db = new pg.Client({ connectionString: cfg.databaseUrl, ssl: pgSsl(cfg.databaseUrl) });
  await db.connect();
  await db.query(sql);
  await db.query(
    `INSERT INTO chrome_slots (slot_id, worker_identity, port)
     VALUES ('slot-9222', $1, 9222), ('slot-9223', $1, 9223)
     ON CONFLICT (slot_id) DO UPDATE SET worker_identity = EXCLUDED.worker_identity`,
    [cfg.workerIdentity],
  );
  await db.end();
  console.log("migrated", cfg.databaseUrl.replace(/:[^:@/]+@/, ":***@"));
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
