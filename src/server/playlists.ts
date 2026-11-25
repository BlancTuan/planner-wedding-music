import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool, one, query } from "@/server/db";
import { AppError } from "@/server/errors";
import { versionsConflict } from "@/server/concurrency";

export async function listPlaylists(userId: string) {
  return query(
    `SELECT id, name, description, archived_at AS "archivedAt", version,
      (SELECT coalesce(sum(r.trim_end_ms - r.trim_start_ms), 0) FROM playlist_items i
        JOIN audio_revisions r ON r.id = i.revision_id WHERE i.playlist_id = p.id) AS "durationMs"
     FROM playlists p WHERE owner_user_id = $1 ORDER BY updated_at DESC`,
    [userId],
  );
}

export async function createPlaylist(userId: string, name: string, description: string | null) {
  const id = randomUUID();
  return one(
    `INSERT INTO playlists (id, owner_user_id, name, description) VALUES ($1, $2, $3, $4)
     RETURNING id, name, description, version`,
    [id, userId, name.trim(), description],
  );
}

export async function getPlaylist(userId: string, playlistId: string) {
  const playlist = await one<{ id: string; version: number; name: string; description: string | null; archivedAt: string | null }>(
    `SELECT id, name, description, archived_at AS "archivedAt", version FROM playlists WHERE id = $1 AND owner_user_id = $2`,
    [playlistId, userId],
  );
  if (!playlist) throw new AppError(404, "NOT_FOUND", "Không thấy danh sách.");
  const items = await query(
    `SELECT i.id, i.revision_id AS "revisionId", i.note, i.position,
      (r.trim_end_ms - r.trim_start_ms) AS "durationMs"
     FROM playlist_items i JOIN audio_revisions r ON r.id = i.revision_id
     WHERE i.playlist_id = $1 ORDER BY i.position`,
    [playlistId],
  );
  const durationMs = items.reduce((sum, item) => sum + Number(item.durationMs), 0);
  return { ...playlist, items, durationMs };
}

export async function updatePlaylist(userId: string, playlistId: string, input: {
  name?: string;
  description?: string | null;
  archived?: boolean;
  version: number;
}) {
  const current = await getPlaylist(userId, playlistId);
  if (versionsConflict(current.version, input.version)) {
    throw new AppError(409, "CONFLICT", "Danh sách đã được sửa ở một phiên khác.", { version: current.version });
  }
  const updated = await one(
    `UPDATE playlists
     SET name = coalesce($3, name),
       description = CASE WHEN $4::boolean THEN $5 ELSE description END,
       archived_at = CASE WHEN $6::boolean IS NULL THEN archived_at WHEN $6::boolean THEN coalesce(archived_at, now()) ELSE NULL END,
       version = version + 1, updated_at = now()
     WHERE id = $1 AND owner_user_id = $2 AND version = $7
     RETURNING id, version`,
    [
      playlistId,
      userId,
      input.name ?? null,
      input.description !== undefined,
      input.description ?? null,
      input.archived ?? null,
      input.version,
    ],
  );
  if (!updated) throw new AppError(409, "CONFLICT", "Danh sách đã được sửa ở một phiên khác.");
  return getPlaylist(userId, playlistId);
}

export async function duplicatePlaylist(userId: string, playlistId: string) {
  const source = await getPlaylist(userId, playlistId);
  const client = await getPool().connect();
  const id = randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO playlists (id, owner_user_id, name, description) VALUES ($1, $2, $3, $4)`,
      [id, userId, `${source.name} (bản sao)`.slice(0, 160), source.description],
    );
    for (const item of source.items) {
      await client.query(
        `INSERT INTO playlist_items (id, playlist_id, revision_id, note, position) VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), id, item.revisionId, item.note, item.position],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return getPlaylist(userId, id);
}

export async function deletePlaylist(userId: string, playlistId: string) {
  await getPlaylist(userId, playlistId);
  await query("DELETE FROM playlists WHERE id = $1 AND owner_user_id = $2", [playlistId, userId]);
}

export async function addPlaylistItem(userId: string, playlistId: string, revisionId: string, note: string | null, version: number) {
  const playlist = await getPlaylist(userId, playlistId);
  if (versionsConflict(playlist.version, version)) {
    throw new AppError(409, "CONFLICT", "Danh sách đã được sửa ở một phiên khác.", { version: playlist.version });
  }
  const revision = await one(
    "SELECT id FROM audio_revisions WHERE id = $1 AND owner_user_id = $2",
    [revisionId, userId],
  );
  if (!revision) throw new AppError(404, "NOT_FOUND", "Không thấy bản chỉnh.");
  const position = playlist.items.length;
  await changePlaylist(playlistId, version, async (client) => {
    await client.query(
      `INSERT INTO playlist_items (id, playlist_id, revision_id, note, position) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), playlistId, revisionId, note, position],
    );
  });
  return getPlaylist(userId, playlistId);
}

export async function removePlaylistItem(userId: string, playlistId: string, itemId: string, version: number) {
  const playlist = await getPlaylist(userId, playlistId);
  if (versionsConflict(playlist.version, version)) throw new AppError(409, "CONFLICT", "Danh sách đã được sửa ở một phiên khác.");
  if (!playlist.items.some((item) => String(item.id) === itemId)) throw new AppError(404, "NOT_FOUND", "Không thấy bài trong danh sách.");
  const remaining = playlist.items.map((item) => String(item.id)).filter((id) => id !== itemId);
  await changePlaylist(playlistId, version, async (client) => {
    await client.query("DELETE FROM playlist_items WHERE id = $1 AND playlist_id = $2", [itemId, playlistId]);
    await client.query("UPDATE playlist_items SET position = position + 1000000 WHERE playlist_id = $1", [playlistId]);
    await client.query(
      `UPDATE playlist_items i SET position = o.ord - 1
       FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord) WHERE i.id = o.id AND i.playlist_id = $1`,
      [playlistId, remaining],
    );
  });
  return getPlaylist(userId, playlistId);
}

async function changePlaylist(playlistId: string, version: number, change: (client: PoolClient) => Promise<void>) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const bumped = await client.query(
      "UPDATE playlists SET version = version + 1, updated_at = now() WHERE id = $1 AND version = $2 RETURNING id",
      [playlistId, version],
    );
    if (!bumped.rowCount) throw new AppError(409, "CONFLICT", "Danh sách đã được sửa ở một phiên khác.");
    await change(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function orderPlaylist(userId: string, playlistId: string, itemIds: string[], version: number) {
  const playlist = await getPlaylist(userId, playlistId);
  if (versionsConflict(playlist.version, version)) throw new AppError(409, "CONFLICT", "Danh sách đã được sửa ở một phiên khác.");
  const known = new Set(playlist.items.map((item) => String(item.id)));
  const submitted = new Set(itemIds);
  if (itemIds.length !== known.size || submitted.size !== known.size || itemIds.some((id) => !known.has(id))) {
    throw new AppError(422, "ORDER_MISMATCH", "Danh sách bài không khớp.");
  }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE playlist_items SET position = position + 100000 WHERE playlist_id = $1", [playlistId]);
    for (let index = 0; index < itemIds.length; index += 1) {
      const updated = await client.query(
        "UPDATE playlist_items SET position = $3 WHERE id = $1 AND playlist_id = $2",
        [itemIds[index], playlistId, index],
      );
      if (!updated.rowCount) throw new AppError(422, "ORDER_MISMATCH", "Danh sách bài không khớp.");
    }
    const bumped = await client.query("UPDATE playlists SET version = version + 1, updated_at = now() WHERE id = $1 AND version = $2", [
      playlistId,
      version,
    ]);
    if (!bumped.rowCount) throw new AppError(409, "CONFLICT", "Danh sách đã được sửa ở một phiên khác.");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return getPlaylist(userId, playlistId);
}
