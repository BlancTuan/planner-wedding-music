import { existsSync, readFileSync } from "node:fs";

export type AppEnv = {
  databaseUrl: string;
  authTestMode: boolean;
  production: boolean;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  adminSubs: string[];
  youtubeApiKey: string;
  ytDlpPath: string;
  storageRoot: string;
  appOrigin: string;
  audioSessionTtlMs: number;
};

let loaded = false;

function loadDotEnv() {
  if (loaded) return;
  loaded = true;
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index);
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(index + 1);
  }
}

export function getEnv(): AppEnv {
  loadDotEnv();
  return {
    databaseUrl: process.env.DATABASE_URL ?? "postgres://wedding:wedding@127.0.0.1:5433/wedding_music",
    authTestMode: process.env.AUTH_TEST_MODE === "true" && process.env.NODE_ENV !== "production",
    production: process.env.NODE_ENV === "production",
    googleClientId: process.env.AUTH_GOOGLE_ID ?? "",
    googleClientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    googleRedirectUri:
      process.env.AUTH_GOOGLE_REDIRECT_URI ?? "http://127.0.0.1:3000/api/auth/google/callback",
    adminSubs: (process.env.ADMIN_GOOGLE_SUBS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    youtubeApiKey: process.env.YOUTUBE_API_KEY ?? "",
    ytDlpPath: process.env.YTDLP_PATH || "yt-dlp",
    storageRoot: process.env.STORAGE_ROOT ?? "storage",
    appOrigin: process.env.APP_ORIGIN ?? "http://127.0.0.1:3000",
    audioSessionTtlMs: sessionTtlMs(),
  };
}

function sessionTtlMs(): number {
  const value = Number(process.env.AUDIO_SESSION_TTL_MS ?? 1_800_000);
  if (!Number.isFinite(value) || value < 60_000 || value > 86_400_000) return 1_800_000;
  return Math.floor(value);
}
