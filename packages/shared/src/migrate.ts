import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadConfig, loadDotEnv } from "./index.js";

loadDotEnv();

async function migrate() {
  const cfg = loadConfig();
  const adminUrl = cfg.databaseUrl.replace(/\/[^/]+$/, "/postgres");
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const dbName = new URL(cfg.databaseUrl.replace("postgres://", "http://")).pathname.slice(1);
  const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
  if (!exists.rowCount) {
    await admin.query(`CREATE DATABASE ${dbName}`);
    console.log("created database", dbName);
  }
  await admin.end();

  const sqlPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../infra/schema.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const db = new pg.Client({ connectionString: cfg.databaseUrl });
  await db.connect();
  await db.query(sql);
  await db.end();
  console.log("migrated", cfg.databaseUrl);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
