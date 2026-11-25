import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteAccount, openSession, type SessionUser } from "@/server/auth";
import { one, query } from "@/server/db";
import {
  cancelExport,
  createUpload,
  drainUserExports,
  getExport,
  listLibrary,
  processExport,
  queueExport,
  retryExport,
  saveRevision,
} from "@/server/media/assets";
import { claimQueuedExport } from "@/worker/claim";
import { exportNow } from "../helpers/exports";

let user: SessionUser;
let assetId: string;
let longAssetId: string;
const dir = mkdtempSync(path.join(tmpdir(), "wmp-export-"));

async function newRevision(trimEndMs = 1500, asset = assetId) {
  const revision = await saveRevision({
    userId: user.id,
    assetId: asset,
    idempotencyKey: `r-${randomUUID()}`,
    trimStartMs: 0,
    trimEndMs,
    fadeInMs: 0,
    fadeOutMs: 0,
    gainDb: 0,
  });
  return String(revision.id);
}

async function usedBytes() {
  const row = await one<{ used: string }>("SELECT storage_used_bytes::text AS used FROM users WHERE id = $1", [user.id]);
  return Number(row?.used);
}

async function insertJob(state: string, revisionId: string, updatedAt = "now()") {
  const id = randomUUID();
  await query(
    `INSERT INTO export_artifacts (id, revision_id, owner_user_id, state, idempotency_key, updated_at)
     VALUES ($1, $2, $3, $4, $5, ${updatedAt})`,
    [id, revisionId, user.id, state, `manual-${id}`],
  );
  return id;
}

async function clearOpenJobs() {
  await query(
    `UPDATE export_artifacts SET state = 'FAILED', error_code = 'TEST'
     WHERE owner_user_id = $1 AND state IN ('QUEUED', 'PROCESSING', 'VERIFYING')`,
    [user.id],
  );
}

function exportFiles() {
  return readdirSync(path.resolve("storage", "exports")).length;
}

async function upload(seconds: number) {
  const wav = path.join(dir, `tone-${seconds}.wav`);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-ac", "1", wav]);
  const job = await createUpload({ userId: user.id, filename: `tone-${seconds}.wav`, bytes: readFileSync(wav), idempotencyKey: `u-${randomUUID()}` });
  return String(job.assetId);
}

beforeAll(async () => {
  const session = await openSession({ subject: `export-jobs-${randomUUID()}`, displayName: "Xuất" });
  user = session.user;
  assetId = await upload(3);
  longAssetId = await upload(240);
});

beforeEach(async () => {
  await drainUserExports(user.id);
});

afterAll(async () => {
  await drainUserExports(user.id);
  await deleteAccount(user, true, user.version);
});

describe("export queue", () => {
  it("returns a queued job at once and completes it in the background", async () => {
    const queued = await queueExport(user.id, await newRevision(), `e-${randomUUID()}`);

    expect(queued.state).toBe("QUEUED");
    expect(queued).not.toHaveProperty("storageKey");
    await drainUserExports(user.id);
    const done = await getExport(user.id, String(queued.id));
    expect(done.state).toBe("COMPLETED");
    expect(done).not.toHaveProperty("storageKey");
  });

  it("queues a second export while one is active instead of rejecting it", async () => {
    const active = await insertJob("PROCESSING", await newRevision());
    const queued = await queueExport(user.id, await newRevision(1100), `e-${randomUUID()}`);

    await drainUserExports(user.id);
    expect((await getExport(user.id, String(queued.id))).state).toBe("QUEUED");

    await query("UPDATE export_artifacts SET state = 'FAILED', error_code = 'TEST' WHERE id = $1", [active]);
    await drainUserExports(user.id);
    expect((await getExport(user.id, String(queued.id))).state).toBe("COMPLETED");
  });

  it("rejects a sixth queued export", async () => {
    try {
      await insertJob("PROCESSING", await newRevision());
      for (let index = 0; index < 5; index += 1) await insertJob("QUEUED", await newRevision(1000 + index * 10));

      await expect(queueExport(user.id, await newRevision(1200), `e-${randomUUID()}`)).rejects.toMatchObject({
        status: 409,
        code: "EXPORT_QUEUE_FULL",
      });
    } finally {
      await clearOpenJobs();
    }
  });

  it("never allows two active exports for one user", async () => {
    try {
      await insertJob("PROCESSING", await newRevision());
      await expect(insertJob("VERIFYING", await newRevision(1100))).rejects.toMatchObject({ code: "23505" });
    } finally {
      await clearOpenJobs();
    }
  });

  it("recovers a stale job from the worker claim so the user is not skipped", async () => {
    const stuck = await insertJob("PROCESSING", await newRevision(), "now() - interval '1 hour'");
    try {
      const claimed = await claimQueuedExport();
      if (claimed) await processExport(claimed.id, true);

      expect(await getExport(user.id, stuck)).toMatchObject({ state: "FAILED", errorCode: "STALE_JOB" });
    } finally {
      await clearOpenJobs();
    }
  });

  it("renders only one of two exports queued at the same moment, then the other", async () => {
    const [a, b] = await Promise.all([
      queueExport(user.id, await newRevision(1300), `e-${randomUUID()}`),
      queueExport(user.id, await newRevision(1400), `e-${randomUUID()}`),
    ]);
    await Promise.all([drainUserExports(user.id), drainUserExports(user.id)]);

    expect((await getExport(user.id, String(a.id))).state).toBe("COMPLETED");
    expect((await getExport(user.id, String(b.id))).state).toBe("COMPLETED");
  });

  it("returns the stored job when a key is reused after a crash before the response was recorded", async () => {
    const revisionId = await newRevision();
    const id = randomUUID();
    const key = `crash-${id}`;
    await query(
      `INSERT INTO export_artifacts (id, revision_id, owner_user_id, state, idempotency_key) VALUES ($1, $2, $3, 'QUEUED', $4)`,
      [id, revisionId, user.id, key],
    );

    const again = await queueExport(user.id, revisionId, key);

    expect(again.id).toBe(id);
    await drainUserExports(user.id);
  });
});

describe("export quota", () => {
  it("counts the estimates of jobs already queued against the quota", async () => {
    try {
      await insertJob("PROCESSING", await newRevision());
      const used = await usedBytes();
      await query("UPDATE users SET storage_quota_bytes = $2 WHERE id = $1", [user.id, used + 2 * 1500 * 24 + 10000]);
      await queueExport(user.id, await newRevision(1500), `e-${randomUUID()}`);

      await expect(queueExport(user.id, await newRevision(1500), `e-${randomUUID()}`)).rejects.toMatchObject({
        status: 413,
        code: "QUOTA_EXCEEDED",
      });
    } finally {
      await query("UPDATE users SET storage_quota_bytes = DEFAULT WHERE id = $1", [user.id]);
      await clearOpenJobs();
    }
  });

  it("rejects an export whose estimated size exceeds the quota", async () => {
    const used = await usedBytes();
    await query("UPDATE users SET storage_quota_bytes = $2 WHERE id = $1", [user.id, used + 10]);
    try {
      await expect(queueExport(user.id, await newRevision(), `e-${randomUUID()}`)).rejects.toMatchObject({
        status: 413,
        code: "QUOTA_EXCEEDED",
      });
    } finally {
      await query("UPDATE users SET storage_quota_bytes = DEFAULT WHERE id = $1", [user.id]);
    }
  });

  it("fails a finished export that would exceed the quota and charges nothing", async () => {
    const id = await insertJob("QUEUED", await newRevision());
    const used = await usedBytes();
    const files = exportFiles();
    await query("UPDATE users SET storage_quota_bytes = $2 WHERE id = $1", [user.id, used + 10]);
    try {
      await processExport(id);
    } finally {
      await query("UPDATE users SET storage_quota_bytes = DEFAULT WHERE id = $1", [user.id]);
    }

    const job = await getExport(user.id, id);
    expect(job).toMatchObject({ state: "FAILED", errorCode: "QUOTA_EXCEEDED" });
    expect(await usedBytes()).toBe(used);
    expect(exportFiles()).toBe(files);
  });
});

describe("export lifecycle", () => {
  it("stops the render when a processing job is cancelled", async () => {
    const id = await insertJob("QUEUED", await newRevision(230000, longAssetId));
    const used = await usedBytes();
    const files = exportFiles();
    const running = processExport(id);
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if ((await getExport(user.id, id)).state === "PROCESSING") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const started = Date.now();

    await cancelExport(user.id, id);
    await running;

    expect(Date.now() - started).toBeLessThan(400);
    expect((await getExport(user.id, id)).state).toBe("CANCELLED");
    expect(await usedBytes()).toBe(used);
    expect(exportFiles()).toBe(files);
  });

  it("stops the render when another process marks the job cancelled", async () => {
    const id = await insertJob("QUEUED", await newRevision(230000, longAssetId));
    const files = exportFiles();
    const running = processExport(id);
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if ((await getExport(user.id, id)).state === "PROCESSING") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const started = Date.now();

    await query("UPDATE export_artifacts SET state = 'CANCELLED' WHERE id = $1", [id]);
    await running;

    expect(Date.now() - started).toBeLessThan(700);
    expect((await getExport(user.id, id)).state).toBe("CANCELLED");
    expect(exportFiles()).toBe(files);
  });

  it("skips the render when the job was cancelled right after it was claimed", async () => {
    const id = await insertJob("PROCESSING", await newRevision(230000, longAssetId));
    await cancelExport(user.id, id);
    const started = Date.now();

    await processExport(id, true);

    expect(Date.now() - started).toBeLessThan(300);
    expect((await getExport(user.id, id)).state).toBe("CANCELLED");
  });

  it("refuses to cancel a job that already ended", async () => {
    const exported = await exportNow(user.id, await newRevision(), `e-${randomUUID()}`);

    await expect(cancelExport(user.id, String(exported.id))).rejects.toMatchObject({ status: 409 });
    expect((await getExport(user.id, String(exported.id))).state).toBe("COMPLETED");
  });

  it("renders and charges a queued job once when two workers process it together", async () => {
    const id = await insertJob("QUEUED", await newRevision());
    const before = await usedBytes();

    await Promise.all([processExport(id), processExport(id)]);

    const row = await one<{ state: string; storageKey: string }>(
      `SELECT state, storage_key AS "storageKey" FROM export_artifacts WHERE id = $1`,
      [id],
    );
    expect(row?.state).toBe("COMPLETED");
    const size = readFileSync(path.resolve("storage", String(row?.storageKey))).byteLength;
    expect((await usedBytes()) - before).toBe(size);
  });

  it("recovers a job stuck in PROCESSING so new exports are not blocked forever", async () => {
    const stuck = await insertJob("PROCESSING", await newRevision(), "now() - interval '1 hour'");

    const next = await exportNow(user.id, await newRevision(1200), `e-${randomUUID()}`);

    expect(next.state).toBe("COMPLETED");
    expect(await getExport(user.id, stuck)).toMatchObject({ state: "FAILED", errorCode: "STALE_JOB" });
  });

  it("retries a failed job to completion", async () => {
    const failed = await insertJob("FAILED", await newRevision());

    const retried = await retryExport(user.id, failed);
    expect(retried.state).toBe("QUEUED");
    await drainUserExports(user.id);

    const done = await getExport(user.id, failed);
    expect(done.state).toBe("COMPLETED");
    expect(done.errorCode).toBeNull();
    expect(Number(done.durationMs)).toBeGreaterThan(1000);
  });

  it("refuses to retry a completed job", async () => {
    const exported = await exportNow(user.id, await newRevision(), `e-${randomUUID()}`);

    await expect(retryExport(user.id, String(exported.id))).rejects.toMatchObject({ status: 409 });
  });
});

describe("library listing", () => {
  it("returns each asset with its revisions and their exports", async () => {
    const revisionId = await newRevision(1300);
    const exported = await exportNow(user.id, revisionId, `e-${randomUUID()}`);

    const items = await listLibrary(user.id, "", "", "");

    const asset = items.find((item) => item.id === assetId);
    const revision = asset?.revisions.find((item) => item.id === revisionId);
    expect(revision?.trimEndMs).toBe(1300);
    expect(revision?.exports.map((item) => item.id)).toContain(exported.id);
    expect(revision?.exports[0]).not.toHaveProperty("storageKey");
  });
});
