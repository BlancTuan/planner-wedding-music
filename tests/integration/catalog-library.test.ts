import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as saveToLibrary } from "@/app/api/catalog/tracks/[trackId]/library/route";
import { deleteAccount, openSession, type SessionUser } from "@/server/auth";
import { one, query } from "@/server/db";
import { AppError } from "@/server/errors";
import { deleteAsset, listLibrary, registerReadyAsset, saveCatalogTrackToLibrary } from "@/server/media/assets";
import { removeStorage, safePath } from "@/server/storage";

let user: SessionUser;
let other: SessionUser;
let token: string;
let wav: Buffer;
let catalogAssetId: string;
let catalogKey: string;
let playableTrackId: string;
let metadataTrackId: string;

async function usedBytes() {
  const row = await one<{ used: string }>("SELECT storage_used_bytes::text AS used FROM users WHERE id = $1", [user.id]);
  return Number(row?.used ?? 0);
}

beforeAll(async () => {
  const first = await openSession({ subject: `catalog-lib-${randomUUID()}`, displayName: "Thư viện mục lục" });
  const second = await openSession({ subject: `catalog-lib-other-${randomUUID()}`, displayName: "Người khác" });
  user = first.user;
  token = first.token;
  other = second.user;
  const dir = mkdtempSync(path.join(tmpdir(), "wmp-catalog-lib-"));
  const file = path.join(dir, "tone.wav");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-ac", "1", file]);
  wav = readFileSync(file);
  catalogAssetId = await registerReadyAsset({
    userId: user.id,
    sourceType: "CATALOG",
    filename: "don-khach.wav",
    bytes: wav,
  });
  const stored = await one<{ storageKey: string }>(
    `SELECT storage_key AS "storageKey" FROM audio_assets WHERE id = $1`,
    [catalogAssetId],
  );
  catalogKey = stored?.storageKey ?? "";
  const artistId = randomUUID();
  await query("INSERT INTO artists (id, name) VALUES ($1, $2)", [artistId, `Nghệ sĩ ${artistId.slice(0, 8)}`]);
  playableTrackId = randomUUID();
  metadataTrackId = randomUUID();
  await query(
    `INSERT INTO catalog_tracks (id, title, artist_id, duration_ms, vocal_type, source_note, usage_permission, publish_state, audio_asset_id)
     VALUES ($1, $2, $3, 2000, 'INSTRUMENTAL', 'Bản nghe thử', 'PREVIEW_ALLOWED', 'PUBLISHED', $4),
            ($5, $6, $3, NULL, 'VOCAL', 'Chỉ thông tin', 'METADATA_ONLY', 'PUBLISHED', NULL)`,
    [playableTrackId, "Khúc đón khách thử", artistId, catalogAssetId, metadataTrackId, "Khúc chỉ thông tin"],
  );
});

afterAll(async () => {
  const files = await query<{ storageKey: string }>(
    `SELECT storage_key AS "storageKey" FROM audio_assets WHERE id = $1
     UNION SELECT storage_key FROM waveforms WHERE asset_id = $1`,
    [catalogAssetId],
  );
  await query("DELETE FROM catalog_tracks WHERE id = ANY($1::uuid[])", [[playableTrackId, metadataTrackId]]);
  await query("DELETE FROM audio_assets WHERE id = $1", [catalogAssetId]);
  await Promise.all(files.map((file) => removeStorage(file.storageKey).catch(() => undefined)));
  await deleteAccount(user, true, user.version);
  await deleteAccount(other, true, other.version);
});

describe("save a catalog track into the private library", () => {
  it("copies playable audio once and leaves the shared catalog file in place", async () => {
    const before = await usedBytes();
    const saved = await saveCatalogTrackToLibrary({
      userId: user.id,
      trackId: playableTrackId,
      idempotencyKey: `lib-${randomUUID()}`,
    });
    const again = await saveCatalogTrackToLibrary({
      userId: user.id,
      trackId: playableTrackId,
      idempotencyKey: `lib-${randomUUID()}`,
    });

    expect(saved.alreadySaved).toBe(false);
    expect(again).toEqual({ assetId: saved.assetId, alreadySaved: true });
    const library = await listLibrary(user.id, "", "CATALOG", "");
    expect(library.map((item) => item.id)).toContain(saved.assetId);
    const copy = library.find((item) => item.id === saved.assetId);
    expect(copy).toMatchObject({ sourceType: "CATALOG", status: "READY", originalFilename: "Khúc đón khách thử.wav" });
    expect(Number(copy?.byteSize)).toBe(wav.byteLength);
    expect(await usedBytes()).toBe(before + wav.byteLength);
    const copyKey = await one<{ storageKey: string }>(
      `SELECT storage_key AS "storageKey" FROM audio_assets WHERE id = $1`,
      [saved.assetId],
    );
    expect(copyKey?.storageKey).not.toBe(catalogKey);
    await deleteAsset(user.id, saved.assetId);
    expect(existsSync(safePath(catalogKey))).toBe(true);
    expect(await usedBytes()).toBe(before);
  });

  it("does not save a metadata-only track or a missing track", async () => {
    await expect(
      saveCatalogTrackToLibrary({ userId: user.id, trackId: metadataTrackId, idempotencyKey: `lib-${randomUUID()}` }),
    ).rejects.toMatchObject({ status: 422, code: "NOT_AN_AUDIO_SOURCE" } satisfies Partial<AppError>);
    await expect(
      saveCatalogTrackToLibrary({ userId: user.id, trackId: randomUUID(), idempotencyKey: `lib-${randomUUID()}` }),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(await listLibrary(user.id, "", "CATALOG", "")).toEqual([]);
  });

  it("keeps another user's library empty", async () => {
    const saved = await saveCatalogTrackToLibrary({
      userId: user.id,
      trackId: playableTrackId,
      idempotencyKey: `lib-${randomUUID()}`,
    });
    expect(await listLibrary(other.id, "", "CATALOG", "")).toEqual([]);
    await deleteAsset(user.id, saved.assetId);
  });

  it("requires a session on the route and returns the saved asset", async () => {
    const anonymous = await saveToLibrary(new Request("http://localhost/api", { method: "POST" }), {
      params: Promise.resolve({ trackId: playableTrackId }),
    });
    expect(anonymous.status).toBe(401);

    const response = await saveToLibrary(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { cookie: `wmp_session=${token}`, "idempotency-key": `lib-${randomUUID()}` },
      }),
      { params: Promise.resolve({ trackId: playableTrackId }) },
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.alreadySaved).toBe(false);
    expect(await listLibrary(user.id, "", "CATALOG", "")).toEqual([expect.objectContaining({ id: body.assetId })]);
    await deleteAsset(user.id, body.assetId);
  });
});
