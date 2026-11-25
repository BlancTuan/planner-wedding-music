import { one, query } from "@/server/db";
import { AppError } from "@/server/errors";
import { canPreview } from "@/server/catalog/preview";

export type CatalogQuery = {
  q?: string;
  stage?: string;
  mood?: string;
  style?: string;
  language?: string;
  vocalType?: string;
  sortBy?: string;
  page?: number;
  pageSize?: number;
};

type TrackRow = {
  id: string;
  title: string;
  artist: string;
  durationMs: number | null;
  vocalType: string;
  usagePermission: string;
  publishState: string;
  sourceNote: string | null;
  assetStatus: string | null;
  assetId: string | null;
};

const trackSelect = `
  SELECT t.id, t.title, ar.name AS artist, t.duration_ms AS "durationMs", t.vocal_type AS "vocalType",
    t.usage_permission AS "usagePermission", t.publish_state AS "publishState", t.source_note AS "sourceNote",
    a.status AS "assetStatus", t.audio_asset_id AS "assetId"
  FROM catalog_tracks t
  JOIN artists ar ON ar.id = t.artist_id
  LEFT JOIN audio_assets a ON a.id = t.audio_asset_id
`;

export async function searchCatalog(input: CatalogQuery) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20));
  const sort =
    input.sortBy === "artist" ? "ar.name, t.title" : input.sortBy === "recent" ? "t.created_at DESC" : "t.title";
  const values: unknown[] = [input.q ?? "", input.stage ?? "", input.mood ?? "", input.style ?? "", input.language ?? "", input.vocalType ?? ""];
  const where = `
    t.publish_state = 'PUBLISHED'
    AND ($1 = '' OR vi_fold(t.title) LIKE '%' || vi_fold($1) || '%' OR vi_fold(ar.name) LIKE '%' || vi_fold($1) || '%'
      OR EXISTS (
        SELECT 1 FROM catalog_track_tags ctt JOIN tags tag ON tag.id = ctt.tag_id
        WHERE ctt.track_id = t.id AND vi_fold(tag.name) LIKE '%' || vi_fold($1) || '%'
      ))
    AND ($2 = '' OR EXISTS (
      SELECT 1 FROM catalog_track_stages cts JOIN music_categories c ON c.id = cts.category_id
      WHERE cts.track_id = t.id AND c.kind = 'CEREMONY' AND c.slug = $2 AND c.is_active
    ))
    AND ($3 = '' OR EXISTS (SELECT 1 FROM music_categories c WHERE c.id = t.mood_category_id AND c.slug = $3))
    AND ($4 = '' OR EXISTS (SELECT 1 FROM music_categories c WHERE c.id = t.style_category_id AND c.slug = $4))
    AND ($5 = '' OR EXISTS (SELECT 1 FROM music_categories c WHERE c.id = t.language_category_id AND c.slug = $5))
    AND ($6 = '' OR t.vocal_type = $6)
  `;
  const total = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM catalog_tracks t JOIN artists ar ON ar.id = t.artist_id WHERE ${where}`,
    values,
  );
  const items = await query<TrackRow>(
    `${trackSelect} WHERE ${where} ORDER BY ${sort} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  return { items: items.map(presentTrack), page, pageSize, total: Number(total?.count ?? 0) };
}

export async function getPublishedTrack(id: string) {
  const track = await one<TrackRow>(`${trackSelect} WHERE t.id = $1 AND t.publish_state = 'PUBLISHED'`, [id]);
  if (!track) throw new AppError(404, "NOT_FOUND", "Không tìm thấy bài nhạc.");
  const stages = await query<{ nameVi: string; slug: string }>(
    `SELECT c.name_vi AS "nameVi", c.slug FROM catalog_track_stages cts
     JOIN music_categories c ON c.id = cts.category_id WHERE cts.track_id = $1 ORDER BY c.sort_order`,
    [id],
  );
  return { ...presentTrack(track), stages };
}

function presentTrack(track: TrackRow) {
  const previewable = canPreview({
    usagePermission: track.usagePermission,
    assetStatus: track.assetStatus,
  });
  return { ...track, previewable, editable: previewable };
}

export async function listCategories() {
  return query(
    `SELECT id, kind, name_vi AS "nameVi", slug, sort_order AS "sortOrder"
     FROM music_categories WHERE is_active ORDER BY kind, sort_order`,
  );
}

export async function previewAssetForTrack(trackId: string) {
  const track = await getPublishedTrack(trackId);
  if (!track.previewable || !track.assetId) {
    throw new AppError(403, "PREVIEW_FORBIDDEN", "Bài này chỉ có thông tin, chưa có file nghe.");
  }
  const asset = await one<{ storageKey: string; mediaFormat: string }>(
    `SELECT storage_key AS "storageKey", media_format AS "mediaFormat" FROM audio_assets WHERE id = $1 AND status = 'READY'`,
    [track.assetId],
  );
  if (!asset) throw new AppError(404, "NOT_FOUND", "Không có file nghe.");
  return asset;
}
