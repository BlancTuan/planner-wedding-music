import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { deleteAccount, openSession, type SessionUser } from "@/server/auth";
import { one, query } from "@/server/db";
import { createImport } from "@/server/youtube/imports";

const fixtureDir = path.join(process.cwd(), "tests/fixtures/media");

describe("YouTube fixture import gate", () => {
  let user: SessionUser;

  beforeAll(async () => {
    const session = await openSession({ subject: `fixture-gate-${randomUUID()}`, displayName: "Kiểm thử" });
    user = session.user;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await deleteAccount(user, true, user.version);
  });

  it("rejects fixture ids when test mode is off", async () => {
    vi.stubEnv("AUTH_TEST_MODE", "false");
    await expect(createImport(user.id, "fixture:tone", `k-${randomUUID()}`)).rejects.toMatchObject({
      status: 422,
      code: "FIXTURE_DISABLED",
    });
  });

  it("rejects fixture ids in production even with test mode on", async () => {
    vi.stubEnv("AUTH_TEST_MODE", "true");
    vi.stubEnv("NODE_ENV", "production");
    await expect(createImport(user.id, "fixture:tone", `k-${randomUUID()}`)).rejects.toMatchObject({
      status: 422,
      code: "FIXTURE_DISABLED",
    });
  });

  it("does not create a file for a missing fixture", async () => {
    vi.stubEnv("AUTH_TEST_MODE", "true");
    const before = readdirSync(fixtureDir).sort();
    const name = `missing-${randomUUID().slice(0, 8)}`;
    await expect(createImport(user.id, `fixture:${name}`, `k-${randomUUID()}`)).rejects.toMatchObject({
      status: 404,
      code: "FIXTURE_NOT_FOUND",
    });
    expect(existsSync(path.join(fixtureDir, `${name}.wav`))).toBe(false);
    expect(readdirSync(fixtureDir).sort()).toEqual(before);
  });

  it.each([["fixture:../tone"], ["fixture:Tone"], ["fixture:a/b"], [`fixture:${"a".repeat(41)}`], ["fixture:"]])(
    "rejects unsafe fixture name %s",
    async (raw) => {
      vi.stubEnv("AUTH_TEST_MODE", "true");
      await expect(createImport(user.id, raw, `k-${randomUUID()}`)).rejects.toMatchObject({ status: 422 });
    },
  );

  it("imports the tone fixture in test mode", async () => {
    vi.stubEnv("AUTH_TEST_MODE", "true");
    const job = await createImport(user.id, "fixture:tone", `k-${randomUUID()}`);
    expect(job.state).toBe("READY_FOR_EDITING");
    expect(job.assetId).toBeTruthy();
  });

  it("returns the same job when the key is reused with the same content", async () => {
    vi.stubEnv("AUTH_TEST_MODE", "true");
    const key = `k-${randomUUID()}`;
    const first = await createImport(user.id, "fixture:tone", key);
    const second = await createImport(user.id, "fixture:tone", key);
    expect(second.id).toBe(first.id);
  });

  it("rejects a fixture import that exceeds the storage quota without charging", async () => {
    vi.stubEnv("AUTH_TEST_MODE", "true");
    const used = await one<{ used: string }>(`SELECT storage_used_bytes::text AS used FROM users WHERE id = $1`, [user.id]);
    await query(`UPDATE users SET storage_quota_bytes = $2 WHERE id = $1`, [user.id, Number(used!.used) + 10]);
    try {
      await expect(createImport(user.id, "fixture:tone", `k-${randomUUID()}`)).rejects.toMatchObject({ status: 413 });
      const after = await one<{ used: string }>(`SELECT storage_used_bytes::text AS used FROM users WHERE id = $1`, [user.id]);
      expect(after!.used).toBe(used!.used);
    } finally {
      await query(`UPDATE users SET storage_quota_bytes = DEFAULT WHERE id = $1`, [user.id]);
    }
  });

  it("rejects an idempotency key reused with a different URL", async () => {
    vi.stubEnv("AUTH_TEST_MODE", "true");
    const key = `k-${randomUUID()}`;
    await createImport(user.id, "fixture:tone", key);
    await expect(createImport(user.id, "https://youtu.be/dQw4w9WgXcQ", key)).rejects.toMatchObject({
      status: 409,
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "Khóa thử lại đang được dùng cho một nội dung khác.",
    });
  });
});
