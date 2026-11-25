import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteAccount, openSession, type SessionUser } from "@/server/auth";
import { one, query } from "@/server/db";
import { createUpload, registerReadyAsset } from "@/server/media/assets";

let user: SessionUser;
let wav: Buffer;

async function usage() {
  const row = await one<{ used: string; quota: string }>(
    "SELECT storage_used_bytes::text AS used, storage_quota_bytes::text AS quota FROM users WHERE id = $1",
    [user.id],
  );
  return { used: Number(row?.used), quota: Number(row?.quota) };
}

async function assetCount() {
  const row = await one<{ count: string }>("SELECT count(*)::text AS count FROM audio_assets WHERE owner_user_id = $1", [user.id]);
  return Number(row?.count);
}

function storedFiles(folder: string) {
  const root = path.resolve("storage", folder);
  return existsSync(root) ? readdirSync(root).length : 0;
}

async function allowOneMore() {
  const { used } = await usage();
  await query("UPDATE users SET storage_quota_bytes = $2 WHERE id = $1", [user.id, used + wav.byteLength + wav.byteLength / 2]);
}

beforeAll(async () => {
  user = (await openSession({ subject: `asset-quota-${randomUUID()}`, displayName: "Hạn mức" })).user;
  const dir = mkdtempSync(path.join(tmpdir(), "wmp-quota-"));
  const file = path.join(dir, "tone.wav");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-ac", "1", file]);
  wav = readFileSync(file);
});

afterAll(async () => {
  await deleteAccount(user, true, user.version);
});

describe("asset quota under concurrent requests", () => {
  it("lets only one of two imports through when the quota has room for one", async () => {
    await allowOneMore();
    const assets = await assetCount();
    const sources = storedFiles("source-audio");
    const waveforms = storedFiles("waveforms");

    const results = await Promise.allSettled([
      registerReadyAsset({ userId: user.id, sourceType: "YOUTUBE", filename: "a.wav", bytes: wav }),
      registerReadyAsset({ userId: user.id, sourceType: "YOUTUBE", filename: "b.wav", bytes: wav }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 413, code: "QUOTA_EXCEEDED" });
    const { used, quota } = await usage();
    expect(used).toBeLessThanOrEqual(quota);
    expect(await assetCount()).toBe(assets + 1);
    expect(storedFiles("source-audio")).toBe(sources + 1);
    expect(storedFiles("waveforms")).toBe(waveforms + 1);
    await query("UPDATE users SET storage_quota_bytes = DEFAULT WHERE id = $1", [user.id]);
  });

  it("fails the second of two uploads when the quota has room for one", async () => {
    await allowOneMore();
    const assets = await assetCount();
    const sources = storedFiles("source-audio");

    const jobs = await Promise.all([
      createUpload({ userId: user.id, filename: "a.wav", bytes: wav, idempotencyKey: `u-${randomUUID()}` }),
      createUpload({ userId: user.id, filename: "b.wav", bytes: wav, idempotencyKey: `u-${randomUUID()}` }),
    ]);

    expect(jobs.map((job) => job.state).sort()).toEqual(["FAILED", "READY"]);
    expect(jobs.find((job) => job.state === "FAILED")?.errorCode).toBe("QUOTA_EXCEEDED");
    const { used, quota } = await usage();
    expect(used).toBeLessThanOrEqual(quota);
    expect(await assetCount()).toBe(assets + 1);
    expect(storedFiles("source-audio")).toBe(sources + 1);
    await query("UPDATE users SET storage_quota_bytes = DEFAULT WHERE id = $1", [user.id]);
  });
});
