import { randomUUID } from "node:crypto";
import { getPool, one, query } from "@/server/db";
import { AppError } from "@/server/errors";
import { nextCatalogVersion } from "@/server/admin/authz";
import { registerReadyAsset } from "@/server/media/assets";

const CATEGORY_KINDS = { styleId: "STYLE", moodId: "MOOD", languageId: "LANGUAGE" } as const;

async function validateCategories(input: { styleId?: string; moodId?: string; languageId?: string; stageIds?: string[] }) {
  const wanted: Array<{ id: string; kind: string }> = [
    ...(Object.keys(CATEGORY_KINDS) as Array<keyof typeof CATEGORY_KINDS>).flatMap((key) =>
      input[key] ? [{ id: input[key] as string, kind: CATEGORY_KINDS[key] }] : [],
    ),
    ...(input.stageIds ?? []).map((id) => ({ id, kind: "CEREMONY" })),
  ];
  if (wanted.length === 0) return;
  const found = await query<{ id: string; kind: string }>(
    "SELECT id, kind FROM music_categories WHERE id = ANY($1::uuid[]) AND is_active",
    [wanted.map((item) => item.id)],
  );
  const kindById = new Map(found.map((row) => [row.id, row.kind]));
  if (wanted.some((item) => kindById.get(item.id) !== item.kind)) {
    throw new AppError(422, "INVALID_CATEGORY", "Danh mục không hợp lệ hoặc không đúng loại.");
  }
}

export async function createCatalogTrack(actorId: string, input: {
  title: string;
  artistName: string;
  vocalType: "VOCAL" | "INSTRUMENTAL" | "MIXED";
  usagePermission: "PREVIEW_ALLOWED" | "METADATA_ONLY" | "RESTRICTED";
  sourceNote?: string | null;
  styleId?: string;
  moodId?: string;
  languageId?: string;
  stageIds?: string[];
}) {
  await validateCategories(input);
  const stageIds = [...new Set(input.stageIds ?? [])];
  const id = randomUUID();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const artist = await client.query<{ id: string }>("SELECT id FROM artists WHERE lower(name) = lower($1)", [input.artistName.trim()]);
    let artistId = artist.rows[0]?.id;
    if (!artistId) {
      artistId = randomUUID();
      await client.query("INSERT INTO artists (id, name) VALUES ($1, $2)", [artistId, input.artistName.trim()]);
    }
    await client.query(
      `INSERT INTO catalog_tracks (
         id, title, artist_id, vocal_type, usage_permission, publish_state, source_note,
         style_category_id, mood_category_id, language_category_id
       ) VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6, $7, $8, $9)`,
      [
        id,
        input.title.trim(),
        artistId,
        input.vocalType,
        input.usagePermission,
        input.sourceNote?.trim() || "Do quản trị viên tạo.",
        input.styleId ?? null,
        input.moodId ?? null,
        input.languageId ?? null,
      ],
    );
    if (stageIds.length > 0) {
      await client.query(
        "INSERT INTO catalog_track_stages (track_id, category_id) SELECT $1, unnest($2::uuid[])",
        [id, stageIds],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await audit(actorId, "CREATE_TRACK", "CatalogTrack", id, `Tạo bài ${input.title.trim()}`);
  return one("SELECT id, title, publish_state AS \"publishState\", version FROM catalog_tracks WHERE id = $1", [id]);
}

export async function listAdminTracks() {
  return query<{
    id: string;
    title: string;
    artist: string;
    vocalType: string;
    usagePermission: string;
    publishState: string;
    version: number;
    durationMs: number | null;
    hasAudio: boolean;
    updatedAt: string;
  }>(
    `SELECT t.id, t.title, ar.name AS artist, t.vocal_type AS "vocalType", t.usage_permission AS "usagePermission",
       t.publish_state AS "publishState", t.version, t.duration_ms AS "durationMs",
       (a.id IS NOT NULL AND a.status = 'READY') AS "hasAudio", t.updated_at AS "updatedAt"
     FROM catalog_tracks t
     JOIN artists ar ON ar.id = t.artist_id
     LEFT JOIN audio_assets a ON a.id = t.audio_asset_id
     ORDER BY t.updated_at DESC, t.title
     LIMIT 200`,
  );
}

export async function setPublishState(actorId: string, trackId: string, published: boolean, version: number) {
  const track = await one<{ version: number }>("SELECT version FROM catalog_tracks WHERE id = $1", [trackId]);
  if (!track) throw new AppError(404, "NOT_FOUND", "Không thấy bài trong danh mục.");
  if (track.version !== version) throw new AppError(409, "CONFLICT", "Bài đã được sửa ở một phiên khác.");
  const state = published ? "PUBLISHED" : "UNPUBLISHED";
  await query(
    "UPDATE catalog_tracks SET publish_state = $2, version = $3, updated_at = now() WHERE id = $1 AND version = $4",
    [trackId, state, nextCatalogVersion(version), version],
  );
  await audit(actorId, published ? "PUBLISH_TRACK" : "UNPUBLISH_TRACK", "CatalogTrack", trackId, state);
  return one("SELECT id, publish_state AS \"publishState\", version FROM catalog_tracks WHERE id = $1", [trackId]);
}

export async function replaceCatalogMedia(actorId: string, trackId: string, filename: string, bytes: Buffer) {
  const track = await one<{ audioAssetId: string | null; version: number }>(
    `SELECT audio_asset_id AS "audioAssetId", version FROM catalog_tracks WHERE id = $1`,
    [trackId],
  );
  if (!track) throw new AppError(404, "NOT_FOUND", "Không thấy bài trong danh mục.");
  const assetId = await registerReadyAsset({
    userId: actorId,
    sourceType: "CATALOG",
    filename,
    bytes,
  });
  if (track.audioAssetId) {
    await query(
      `UPDATE audio_assets SET source_version = (
         SELECT coalesce(max(source_version), 0) + 1 FROM audio_assets WHERE id = $2 OR replaces_asset_id = $2
       ), replaces_asset_id = $2 WHERE id = $1`,
      [assetId, track.audioAssetId],
    );
  }
  await query(
    `UPDATE catalog_tracks SET audio_asset_id = $2, duration_ms = (SELECT duration_ms FROM audio_assets WHERE id = $2),
       version = version + 1, updated_at = now() WHERE id = $1`,
    [trackId, assetId],
  );
  await audit(actorId, "REPLACE_MEDIA", "CatalogTrack", trackId, "Gắn phiên bản nguồn mới.");
  return { trackId, assetId, version: track.version + 1 };
}

export async function listFailures() {
  return query(
    `SELECT 'UPLOAD' AS kind, id, error_code AS "errorCode", updated_at AS "updatedAt"
     FROM upload_jobs WHERE state = 'FAILED'
     UNION ALL
     SELECT 'YOUTUBE', id, error_code, updated_at FROM youtube_import_jobs WHERE state = 'FAILED'
     ORDER BY "updatedAt" DESC LIMIT 50`,
  );
}

export async function listAudit() {
  return query(
    `SELECT id, action, entity_type AS "entityType", entity_id AS "entityId", summary, created_at AS "createdAt"
     FROM administrative_audit_logs ORDER BY created_at DESC LIMIT 50`,
  );
}

async function audit(actorId: string, action: string, entityType: string, entityId: string, summary: string) {
  await query(
    `INSERT INTO administrative_audit_logs (id, actor_user_id, action, entity_type, entity_id, summary)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), actorId, action, entityType, entityId, summary.slice(0, 1000)],
  );
}
