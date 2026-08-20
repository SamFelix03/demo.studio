import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadConfig, type AppConfig } from "./config.js";

let client: SupabaseClient | undefined;

export function prefix(mode: string, jobId: string, rest = ""): string {
  return `demo-studio/${mode}/${jobId}/${rest}`.replace(/\/+$/, "");
}

export function getStorage(cfg: AppConfig = loadConfig()): SupabaseClient {
  if (!cfg.supabase.url || !cfg.supabase.serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for artifact storage");
  }
  if (!client) {
    client = createClient(cfg.supabase.url, cfg.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export async function ensureBucket(cfg: AppConfig = loadConfig()) {
  const sb = getStorage(cfg);
  const { data } = await sb.storage.listBuckets();
  if (data?.some((b) => b.name === cfg.supabase.bucket)) return;
  const { error } = await sb.storage.createBucket(cfg.supabase.bucket, {
    public: false,
    fileSizeLimit: "512MB",
  });
  if (error && !/already exists/i.test(error.message)) throw error;
}

export async function putObject(
  key: string,
  body: Buffer | string,
  contentType = "application/octet-stream",
) {
  const cfg = loadConfig();
  const buf = typeof body === "string" ? Buffer.from(body) : body;
  const { error } = await getStorage(cfg).storage.from(cfg.supabase.bucket).upload(key, buf, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  return key;
}

export async function signedUrl(key: string, expiresIn = 3600) {
  const cfg = loadConfig();
  const { data, error } = await getStorage(cfg)
    .storage.from(cfg.supabase.bucket)
    .createSignedUrl(key, expiresIn);
  if (error || !data?.signedUrl) throw error ?? new Error(`no signed URL for ${key}`);
  return data.signedUrl;
}

export async function getObjectText(key: string) {
  const cfg = loadConfig();
  const { data, error } = await getStorage(cfg).storage.from(cfg.supabase.bucket).download(key);
  if (error || !data) throw error ?? new Error(`missing object ${key}`);
  return data.text();
}
