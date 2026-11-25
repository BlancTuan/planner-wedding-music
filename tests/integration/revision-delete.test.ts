import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DELETE as deleteRevisionRoute } from "@/app/api/revisions/[revisionId]/route";
import { deleteAccount, openSession, type SessionUser } from "@/server/auth";
import { one, query } from "@/server/db";
import { deleteRevision, getOwnedAsset, listLibrary, registerReadyAsset, saveRevision } from "@/server/media/assets";
import { addPlaylistItem, createPlaylist } from "@/server/playlists";
import { safePath } from "@/server/storage";
import { exportNow } from "../helpers/exports";

let user: SessionUser;
let other: SessionUser;
let token: string;
let assetId: string;

const trim = { trimStartMs: 0, trimEndMs: 1500, fadeInMs: 0, fadeOutMs: 0, gainDb: 0 };

async function newRevision(trimEndMs = 1500, name = "Bản thử") {
  const revision = await saveRevision({ userId: user.id, assetId, idempotencyKey: `rev-${randomUUID()}`, name, ...trim, trimEndMs });
  return String((revision as { id: string }).id);
}

async function usedBytes() {
  const row = await one<{ used: string }>("SELECT storage_used_bytes::text AS used FROM users WHERE id = $1", [user.id]);
  return Number(row?.used ?? 0);
}

beforeAll(async () => {
  const first = await openSession({ subject: `revision-delete-${randomUUID()}`, displayName: "Xoá bản chỉnh" });
  const second = await openSession({ subject: `revision-delete-other-${randomUUID()}`, displayName: "Người khác" });
  user = first.user;
  token = first.token;
  other = second.user;
  const dir = mkdtempSync(path.join(tmpdir(), "wmp-revision-delete-"));
  const file = path.join(dir, "tone.wav");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-ac", "1", file]);
  assetId = await registerReadyAsset({ userId: user.id, sourceType: "UPLOAD", filename: "tone.wav", bytes: readFileSync(file) });
});

afterAll(async () => {
  await deleteAccount(user, true, user.version);
  await deleteAccount(other, true, other.version);
});

describe("remove a saved revision", () => {
  it("removes only that revision and keeps the source file and the other revisions", async () => {
    const keep = await newRevision(2000, "Giữ lại");
    const drop = await newRevision(2500, "Xoá đi");

    await deleteRevision(user.id, drop);

    const library = await listLibrary(user.id, "", "", "");
    const ids = library.flatMap((item) => item.revisions.map((revision) => revision.id));
    expect(ids).toContain(keep);
    expect(ids).not.toContain(drop);
    expect((await getOwnedAsset(user.id, assetId)).id).toBe(assetId);
    await expect(deleteRevision(user.id, drop)).rejects.toMatchObject({ status: 404 });
  });

  it("removes the exported MP3 and gives its space back", async () => {
    const revisionId = await newRevision(1200, "Có MP3");
    const before = await usedBytes();
    const exported = await exportNow(user.id, revisionId, `exp-${randomUUID()}`);
    expect(exported.state).toBe("COMPLETED");
    const stored = await one<{ storageKey: string }>(
      `SELECT storage_key AS "storageKey" FROM export_artifacts WHERE revision_id = $1`,
      [revisionId],
    );
    expect(existsSync(safePath(stored!.storageKey))).toBe(true);
    expect(await usedBytes()).toBeGreaterThan(before);

    await deleteRevision(user.id, revisionId);

    expect(existsSync(safePath(stored!.storageKey))).toBe(false);
    expect(await usedBytes()).toBe(before);
    expect(await query("SELECT 1 FROM export_artifacts WHERE revision_id = $1", [revisionId])).toEqual([]);
  });

  it("refuses to remove a revision that a playlist uses and names the playlist", async () => {
    const revisionId = await newRevision(1800, "Đang dùng");
    const playlist = await createPlaylist(user.id, "Nhạc đón khách", null);
    await addPlaylistItem(user.id, String(playlist!.id), revisionId, null, Number(playlist!.version));

    await expect(deleteRevision(user.id, revisionId)).rejects.toMatchObject({
      status: 409,
      code: "REVISION_IN_USE",
      details: { plans: ["Nhạc đón khách"] },
    });
    const still = await listLibrary(user.id, "", "", "");
    expect(still.flatMap((item) => item.revisions.map((revision) => revision.id))).toContain(revisionId);
  });

  it("does not let another user remove it", async () => {
    const revisionId = await newRevision(1900, "Của tôi");
    await expect(deleteRevision(other.id, revisionId)).rejects.toMatchObject({ status: 404 });
  });

  it("requires a session on the route and removes the revision for its owner", async () => {
    const revisionId = await newRevision(2200, "Xoá qua API");
    const anonymous = await deleteRevisionRoute(new Request("http://localhost/api", { method: "DELETE" }), {
      params: Promise.resolve({ revisionId }),
    });
    expect(anonymous.status).toBe(401);

    const response = await deleteRevisionRoute(
      new Request("http://localhost/api", { method: "DELETE", headers: { cookie: `wmp_session=${token}` } }),
      { params: Promise.resolve({ revisionId }) },
    );
    expect(response.status).toBe(200);
    expect(await one("SELECT 1 FROM audio_revisions WHERE id = $1", [revisionId])).toBeNull();
  });
});
