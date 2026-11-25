import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { deleteAccount, openSession, type SessionUser } from "@/server/auth";
import { one, query } from "@/server/db";
import { buildHandoff } from "@/server/handoff";
import { createUpload, deleteAsset, saveRevision } from "@/server/media/assets";
import { addCue, addStage, confirmReadiness, createPlan, deletePlan, updateCue } from "@/server/plans";
import { safePath } from "@/server/storage";
import { exportNow } from "../helpers/exports";

let wavBytes: Buffer;

beforeAll(() => {
  const dir = mkdtempSync(path.join(tmpdir(), "wmp-storage-"));
  const wav = path.join(dir, "tone.wav");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-ac", "1", wav]);
  wavBytes = readFileSync(wav);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function newUser(prefix: string) {
  return (await openSession({ subject: `${prefix}-${randomUUID()}`, displayName: "Lưu trữ" })).user;
}

async function usedBytes(userId: string) {
  const row = await one<{ used: string }>(`SELECT storage_used_bytes::text AS used FROM users WHERE id = $1`, [userId]);
  return Number(row!.used);
}

async function exportedAsset(user: SessionUser) {
  const upload = await createUpload({ userId: user.id, filename: "tone.wav", bytes: wavBytes, idempotencyKey: `u-${randomUUID()}` });
  const assetId = String(upload.assetId);
  const revision = await saveRevision({
    userId: user.id,
    assetId,
    idempotencyKey: `r-${randomUUID()}`,
    trimStartMs: 0,
    trimEndMs: 2000,
    fadeInMs: 0,
    fadeOutMs: 0,
    gainDb: 0,
  });
  const exported = await exportNow(user.id, String(revision.id), `e-${randomUUID()}`);
  return { assetId, revisionId: String(revision.id), exportId: String(exported.id) };
}

async function readyPlanWithPackage(user: SessionUser, revisionId: string) {
  const plan = await createPlan(user.id, { name: `Lễ ${randomUUID().slice(0, 6)}`, template: "EMPTY" });
  const staged = await addStage(user.id, plan.id, "Lối vào", plan.version);
  const cued = await addCue(user.id, plan.id, staged.stages[0].id, { revisionId, instruction: "Phát", version: staged.version });
  const approved = await updateCue(user.id, plan.id, cued.stages[0].cues[0].id, { listeningApproved: true, version: cued.version });
  const ready = await confirmReadiness(user.id, plan.id, approved.version);
  await buildHandoff(user.id, plan.id);
  return { planId: plan.id, version: ready.version };
}

async function ownedFiles(userId: string): Promise<string[]> {
  const rows = await query<{ key: string }>(
    `SELECT storage_key AS key FROM audio_assets WHERE owner_user_id = $1
     UNION SELECT w.storage_key FROM waveforms w JOIN audio_assets a ON a.id = w.asset_id WHERE a.owner_user_id = $1
     UNION SELECT storage_key FROM export_artifacts WHERE owner_user_id = $1 AND storage_key IS NOT NULL
     UNION SELECT h.storage_key FROM handoff_packages h JOIN wedding_plans p ON p.id = h.plan_id
       WHERE p.owner_user_id = $1 AND h.storage_key IS NOT NULL`,
    [userId],
  );
  return rows.map((row) => safePath(row.key));
}

describe("storage accounting", () => {
  it("returns export bytes to the user when the asset is deleted", async () => {
    const user = await newUser("acct");
    try {
      const { assetId } = await exportedAsset(user);
      expect(await usedBytes(user.id)).toBeGreaterThan(wavBytes.byteLength);

      await deleteAsset(user.id, assetId);

      expect(await usedBytes(user.id)).toBe(0);
    } finally {
      await deleteAccount(user, true, user.version);
    }
  });

  it("removes handoff ZIP files when the plan is deleted", async () => {
    const user = await newUser("plan-del");
    try {
      const { revisionId } = await exportedAsset(user);
      const { planId, version } = await readyPlanWithPackage(user, revisionId);
      const zip = await one<{ key: string }>(`SELECT storage_key AS key FROM handoff_packages WHERE plan_id = $1`, [planId]);
      expect(existsSync(safePath(zip!.key))).toBe(true);

      await deletePlan(user.id, planId, true, version);

      expect(existsSync(safePath(zip!.key))).toBe(false);
    } finally {
      await deleteAccount(user, true, user.version);
    }
  });
});

describe("account deletion", () => {
  it("removes every private file of the account", async () => {
    const user = await newUser("del-files");
    const { revisionId } = await exportedAsset(user);
    await readyPlanWithPackage(user, revisionId);
    const files = await ownedFiles(user.id);
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(files.every((file) => existsSync(file))).toBe(true);

    await deleteAccount(user, true, user.version);

    expect(files.filter((file) => existsSync(file))).toEqual([]);
    expect(await one(`SELECT id FROM users WHERE id = $1`, [user.id])).toBeNull();
  });

  it("deletes an administrator who has audit records and keeps the records", async () => {
    const user = await newUser("del-admin");
    const auditId = randomUUID();
    await query(
      `INSERT INTO administrative_audit_logs (id, actor_user_id, action, entity_type, entity_id, summary)
       VALUES ($1, $2, 'PUBLISH', 'catalog_track', $3, 'Kiểm thử')`,
      [auditId, user.id, randomUUID()],
    );

    await deleteAccount(user, true, user.version);

    const audit = await one<{ actor: string | null }>(`SELECT actor_user_id AS actor FROM administrative_audit_logs WHERE id = $1`, [auditId]);
    expect(audit).toEqual({ actor: null });
    await query(`DELETE FROM administrative_audit_logs WHERE id = $1`, [auditId]);
  });

  it("keeps all data when the confirmed version is stale", async () => {
    const user = await newUser("del-stale");
    const { assetId } = await exportedAsset(user);
    await query(`UPDATE users SET version = version + 1 WHERE id = $1`, [user.id]);

    await expect(deleteAccount(user, true, user.version)).rejects.toMatchObject({ status: 409 });

    expect(await one(`SELECT id FROM audio_assets WHERE id = $1`, [assetId])).not.toBeNull();
    expect((await ownedFiles(user.id)).every((file) => existsSync(file))).toBe(true);
    await deleteAccount({ ...user, version: user.version + 1 }, true, user.version + 1);
  });
});

describe("sign-in profile refresh", () => {
  it("follows the admin list and provider profile on every sign-in", async () => {
    const subject = `role-${randomUUID()}`;
    vi.stubEnv("ADMIN_GOOGLE_SUBS", subject);
    const first = await openSession({ subject, displayName: "Cũ", email: "old@example.com" });
    expect(first.user.role).toBe("ADMIN");

    vi.stubEnv("ADMIN_GOOGLE_SUBS", "");
    const second = await openSession({ subject, displayName: "Mới", email: "new@example.com" });

    expect(second.user.id).toBe(first.user.id);
    expect(second.user.role).toBe("USER");
    expect(second.user.displayName).toBe("Mới");
    expect(second.user.email).toBe("new@example.com");
    await deleteAccount(second.user, true, second.user.version);
  });
});
