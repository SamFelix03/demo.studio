import { loadDotEnv } from "./load-env.js";

export function loadConfig() {
  loadDotEnv();
  return {
    databaseUrl:
      process.env.DATABASE_URL ??
      "postgres://founderforge:founderforge@localhost:5432/demostudio",
    temporalAddress: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
    temporalNamespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    supabase: {
      url: process.env.SUPABASE_URL ?? "",
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      bucket: process.env.SUPABASE_STORAGE_BUCKET ?? "demo-studio",
    },
    apiPort: Number(process.env.PORT ?? process.env.API_PORT ?? 4031),
    publicApiBase: process.env.PUBLIC_API_BASE_URL ?? "http://localhost:4031",
    lmntApiKey: process.env.LMNT_API_KEY || undefined,
    lmntVoice: process.env.LMNT_VOICE ?? "lily",
    sampleAppUrl: process.env.SAMPLE_APP_URL ?? "http://localhost:4173",
    kaneWsEndpoint: process.env.KANE_WS_ENDPOINT || undefined,
    kaneUsername: process.env.KANE_USERNAME || undefined,
    kaneAccessKey: process.env.KANE_ACCESS_KEY || undefined,
    workerIdentity: process.env.WORKER_IDENTITY ?? "local-1",
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
