import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as listTracksRoute, POST as tracksRoute } from "@/app/api/admin/tracks/route";
import { createCatalogTrack, listAdminTracks, replaceCatalogMedia, setPublishState } from "@/server/admin-catalog";
import { deleteAccount, openSession, type SessionUser } from "@/server/auth";
import { listCategories, searchCatalog } from "@/server/catalog";
import { one, query } from "@/server/db";
import { removeStorage } from "@/server/storage";

let admin: SessionUser;
let adminToken: string;
let member: SessionUser;
let memberToken: string;
let wav: Buffer;
let categories: Array<{ id: string; kind: string }>;
const adminSubject = `catalog-admin-${randomUUID()}`;
const previousAdmins = process.env.ADMIN_GOOGLE_SUBS;
const trackIds: string[] = [];
const tag = randomUUID().slice(0, 8);

function cookie(token: string) {
  return { cookie: `wmp_session=${token}` };
}

function categoryOf(kind: string) {
  return String(categories.find((item) => item.kind === kind)?.id);
}

async function draft(overrides: Partial<Parameters<typeof createCatalogTrack>[1]> = {}) {
  const created = (await createCatalogTrack(admin.id, {
    title: `Bài thử ${tag} ${trackIds.length}`,
    artistName: `Nghệ sĩ ${tag}`,
    vocalType: "INSTRUMENTAL",
    usagePermission: "PREVIEW_ALLOWED",
    ...overrides,
  })) as { id: string; version: number };
  trackIds.push(created.id);
  return created;
}

beforeAll(async () => {
  process.env.ADMIN_GOOGLE_SUBS = [previousAdmins, adminSubject].filter(Boolean).join(",");
  const first = await openSession({ subject: adminSubject, displayName: "Quản trị thử" });
  const second = await openSession({ subject: `catalog-member-${randomUUID()}`, displayName: "Thành viên" });
  admin = first.user;
  adminToken = first.token;
  member = second.user;
  memberToken = second.token;
  const dir = mkdtempSync(path.join(tmpdir(), "wmp-admin-catalog-"));
  const file = path.join(dir, "tone.wav");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-ac", "1", file]);
  wav = readFileSync(file);
  categories = (await listCategories()) as Array<{ id: string; kind: string }>;
});

afterAll(async () => {
  const files = await query<{ storageKey: string }>(
    `SELECT a.storage_key AS "storageKey" FROM audio_assets a JOIN catalog_tracks t ON t.audio_asset_id = a.id WHERE t.id = ANY($1::uuid[])
     UNION SELECT w.storage_key FROM waveforms w JOIN catalog_tracks t ON t.audio_asset_id = w.asset_id WHERE t.id = ANY($1::uuid[])`,
    [trackIds],
  );
  const assets = await query<{ id: string }>("SELECT audio_asset_id AS id FROM catalog_tracks WHERE id = ANY($1::uuid[]) AND audio_asset_id IS NOT NULL", [trackIds]);
  await query("DELETE FROM catalog_tracks WHERE id = ANY($1::uuid[])", [trackIds]);
  await query("DELETE FROM audio_assets WHERE id = ANY($1::uuid[])", [assets.map((row) => row.id)]);
  await query("DELETE FROM artists WHERE name = $1", [`Nghệ sĩ ${tag}`]);
  await Promise.all(files.map((file) => removeStorage(file.storageKey).catch(() => undefined)));
  await deleteAccount(admin, true, admin.version);
  await deleteAccount(member, true, member.version);
  if (previousAdmins === undefined) delete process.env.ADMIN_GOOGLE_SUBS;
  else process.env.ADMIN_GOOGLE_SUBS = previousAdmins;
});

describe("create a catalog track with source note and categories", () => {
  it("stores the note, style, mood, language and recommended stages", async () => {
    const stageIds = categories.filter((item) => item.kind === "CEREMONY").slice(0, 2).map((item) => item.id);
    const created = await draft({
      sourceNote: "Nhạc tự sáng tác, có giấy phép",
      styleId: categoryOf("STYLE"),
      moodId: categoryOf("MOOD"),
      languageId: categoryOf("LANGUAGE"),
      stageIds,
    });

    const row = await one<{ sourceNote: string; style: string; mood: string; language: string }>(
      `SELECT source_note AS "sourceNote", style_category_id AS style, mood_category_id AS mood, language_category_id AS language
       FROM catalog_tracks WHERE id = $1`,
      [created.id],
    );
    expect(row).toEqual({
      sourceNote: "Nhạc tự sáng tác, có giấy phép",
      style: categoryOf("STYLE"),
      mood: categoryOf("MOOD"),
      language: categoryOf("LANGUAGE"),
    });
    const stages = await query<{ id: string }>("SELECT category_id AS id FROM catalog_track_stages WHERE track_id = $1", [created.id]);
    expect(stages.map((stage) => stage.id).sort()).toEqual([...stageIds].sort());
  });

  it("rejects a category of the wrong kind or an unknown one without leaving a draft", async () => {
    const before = await query("SELECT id FROM catalog_tracks WHERE title LIKE $1", [`Sai danh mục ${tag}%`]);
    await expect(
      createCatalogTrack(admin.id, {
        title: `Sai danh mục ${tag}`,
        artistName: `Nghệ sĩ ${tag}`,
        vocalType: "VOCAL",
        usagePermission: "METADATA_ONLY",
        styleId: categoryOf("MOOD"),
      }),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_CATEGORY" });
    await expect(
      createCatalogTrack(admin.id, {
        title: `Sai danh mục ${tag}`,
        artistName: `Nghệ sĩ ${tag}`,
        vocalType: "VOCAL",
        usagePermission: "METADATA_ONLY",
        stageIds: [randomUUID()],
      }),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_CATEGORY" });
    expect(await query("SELECT id FROM catalog_tracks WHERE title LIKE $1", [`Sai danh mục ${tag}%`])).toEqual(before);
  });
});

describe("upload audio and publish to Khám phá", () => {
  it("keeps a draft hidden, then shows it with a listenable file once published", async () => {
    const created = await draft();
    const title = `Khúc đăng ${tag}`;
    await query("UPDATE catalog_tracks SET title = $2 WHERE id = $1", [created.id, title]);
    expect((await searchCatalog({ q: title })).items).toEqual([]);

    const attached = await replaceCatalogMedia(admin.id, created.id, "khuc-dang.wav", wav);
    const asset = await one<{ durationMs: number; ownerUserId: string | null; sourceType: string }>(
      `SELECT duration_ms AS "durationMs", owner_user_id AS "ownerUserId", source_type AS "sourceType" FROM audio_assets WHERE id = $1`,
      [attached.assetId],
    );
    const track = await one<{ durationMs: number | null }>(`SELECT duration_ms AS "durationMs" FROM catalog_tracks WHERE id = $1`, [created.id]);
    expect(asset).toMatchObject({ ownerUserId: null, sourceType: "CATALOG" });
    expect(track?.durationMs).toBe(asset?.durationMs);

    await setPublishState(admin.id, created.id, true, attached.version);
    const found = (await searchCatalog({ q: title })).items;
    expect(found).toEqual([expect.objectContaining({ id: created.id, previewable: true, durationMs: asset?.durationMs })]);

    await setPublishState(admin.id, created.id, false, attached.version + 1);
    expect((await searchCatalog({ q: title })).items).toEqual([]);
  });

  it("does not make an information-only track listenable even with a file", async () => {
    const created = await draft({ usagePermission: "METADATA_ONLY", title: `Chỉ thông tin ${tag}` });
    const attached = await replaceCatalogMedia(admin.id, created.id, "thong-tin.wav", wav);
    await setPublishState(admin.id, created.id, true, attached.version);
    const found = (await searchCatalog({ q: `Chỉ thông tin ${tag}` })).items;
    expect(found).toEqual([expect.objectContaining({ id: created.id, previewable: false })]);
  });
});

describe("admin track list", () => {
  it("lists drafts with state, version, permission and whether audio is attached", async () => {
    const bare = await draft({ title: `Nháp trống ${tag}` });
    const withAudio = await draft({ title: `Nháp có file ${tag}` });
    await replaceCatalogMedia(admin.id, withAudio.id, "co-file.wav", wav);

    const items = await listAdminTracks();
    const bareRow = items.find((item) => item.id === bare.id);
    const audioRow = items.find((item) => item.id === withAudio.id);
    expect(bareRow).toMatchObject({
      title: `Nháp trống ${tag}`,
      artist: `Nghệ sĩ ${tag}`,
      publishState: "DRAFT",
      usagePermission: "PREVIEW_ALLOWED",
      version: 1,
      hasAudio: false,
    });
    expect(audioRow).toMatchObject({ publishState: "DRAFT", hasAudio: true });
    expect(audioRow?.version).toBe(2);
    expect(audioRow?.durationMs).toBeGreaterThan(0);
  });
});

describe("admin routes", () => {
  it("lists tracks only for an administrator", async () => {
    const anonymous = await listTracksRoute(new Request("http://localhost/api/admin/tracks"));
    expect(anonymous.status).toBe(401);
    const denied = await listTracksRoute(new Request("http://localhost/api/admin/tracks", { headers: cookie(memberToken) }));
    expect(denied.status).toBe(403);
    const allowed = await listTracksRoute(new Request("http://localhost/api/admin/tracks", { headers: cookie(adminToken) }));
    expect(allowed.status).toBe(200);
    const body = await allowed.json();
    expect(body.items.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining(trackIds.slice(0, 1)));
  });

  it("creates a track with categories and attaches an uploaded file through the same route", async () => {
    const created = await tracksRoute(
      new Request("http://localhost/api/admin/tracks", {
        method: "POST",
        headers: { ...cookie(adminToken), "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title: `Qua API ${tag}`,
          artistName: `Nghệ sĩ ${tag}`,
          vocalType: "MIXED",
          usagePermission: "PREVIEW_ALLOWED",
          sourceNote: "Nhập qua API",
          styleId: categoryOf("STYLE"),
          stageIds: [categoryOf("CEREMONY")],
        }),
      }),
    );
    expect(created.status).toBe(201);
    const track = await created.json();
    trackIds.push(track.id);

    const form = new FormData();
    form.set("trackId", track.id);
    form.set("file", new File([new Uint8Array(wav)], "qua-api.wav", { type: "audio/wav" }));
    const uploaded = await tracksRoute(new Request("http://localhost/api/admin/tracks", { method: "POST", headers: cookie(adminToken), body: form }));
    expect(uploaded.status).toBe(201);
    const attached = await uploaded.json();

    const published = await tracksRoute(
      new Request("http://localhost/api/admin/tracks", {
        method: "POST",
        headers: { ...cookie(adminToken), "content-type": "application/json" },
        body: JSON.stringify({ action: "publish", trackId: track.id, version: attached.version }),
      }),
    );
    expect(published.status).toBe(200);
    expect((await searchCatalog({ q: `Qua API ${tag}` })).items).toEqual([expect.objectContaining({ id: track.id, previewable: true })]);
  });

  it("denies a normal user from creating or uploading", async () => {
    const response = await tracksRoute(
      new Request("http://localhost/api/admin/tracks", {
        method: "POST",
        headers: { ...cookie(memberToken), "content-type": "application/json" },
        body: JSON.stringify({ action: "create", title: "x", artistName: "y" }),
      }),
    );
    expect(response.status).toBe(403);
  });
});
