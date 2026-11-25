import { randomUUID } from "node:crypto";
import { getPool, one, query } from "@/server/db";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { deletionAllowed } from "@/server/auth/identity";
import { newToken, readCookie, sha256 } from "@/server/http";
import { removeStorage, removeTemporarySessionDir } from "@/server/storage";

export type SessionUser = {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  role: "USER" | "ADMIN";
  storageUsedBytes: string;
  storageQuotaBytes: string;
  version: number;
};

function userSelect(alias: string) {
  return `${alias}.id, ${alias}.display_name AS "displayName", ${alias}.email, ${alias}.avatar_url AS "avatarUrl", ${alias}.role,
  ${alias}.storage_used_bytes AS "storageUsedBytes", ${alias}.storage_quota_bytes AS "storageQuotaBytes", ${alias}.version`;
}

export async function openSession(input: {
  subject: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
}): Promise<{ token: string; user: SessionUser }> {
  const env = getEnv();
  const role = env.adminSubs.includes(input.subject) ? "ADMIN" : "USER";
  const displayName = input.displayName.trim().slice(0, 120) || "Người dùng";
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ user_id: string }>(
      "SELECT user_id FROM auth_identities WHERE provider = 'google' AND subject = $1",
      [input.subject],
    );
    let userId = existing.rows[0]?.user_id;
    if (!userId) {
      userId = randomUUID();
      await client.query(
        `INSERT INTO users (id, display_name, email, avatar_url, role)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, displayName, input.email ?? null, input.avatarUrl ?? null, role],
      );
      await client.query(
        `INSERT INTO auth_identities (id, user_id, provider, subject) VALUES ($1, $2, 'google', $3)`,
        [randomUUID(), userId, input.subject],
      );
    } else {
      await client.query(
        `UPDATE users SET role = $2, display_name = $3, email = coalesce($4, email), avatar_url = coalesce($5, avatar_url),
           updated_at = now()
         WHERE id = $1 AND (role <> $2 OR display_name <> $3 OR email IS DISTINCT FROM coalesce($4, email)
           OR avatar_url IS DISTINCT FROM coalesce($5, avatar_url))`,
        [userId, role, displayName, input.email ?? null, input.avatarUrl ?? null],
      );
    }
    const token = newToken();
    await client.query(
      `INSERT INTO user_sessions (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '14 days')`,
      [randomUUID(), userId, sha256(token)],
    );
    await client.query("COMMIT");
    const user = await one<SessionUser>(`SELECT ${userSelect("users")} FROM users WHERE id = $1`, [userId]);
    if (!user) throw new AppError(500, "INTERNAL", "Không tạo được phiên.");
    return { token, user };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function userFromToken(token: string | null): Promise<SessionUser | null> {
  if (!token) return null;
  return one<SessionUser>(
    `SELECT ${userSelect("u")}
     FROM users u
     JOIN user_sessions s ON s.user_id = u.id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [sha256(token)],
  );
}

export async function requireUser(request: Request): Promise<SessionUser> {
  const user = await userFromToken(readCookie(request, "wmp_session"));
  if (!user) throw new AppError(401, "UNAUTHENTICATED", "Bạn cần đăng nhập.");
  return user;
}

export async function requireAdmin(request: Request): Promise<SessionUser> {
  const user = await requireUser(request);
  if (user.role !== "ADMIN") throw new AppError(403, "FORBIDDEN", "Bạn không có quyền quản trị.");
  const listed = await one<{ id: string }>(
    "SELECT id FROM auth_identities WHERE user_id = $1 AND provider = 'google' AND subject = ANY($2::text[]) LIMIT 1",
    [user.id, getEnv().adminSubs],
  );
  if (!listed) {
    await query("UPDATE users SET role = 'USER', updated_at = now() WHERE id = $1 AND role = 'ADMIN'", [user.id]);
    throw new AppError(403, "FORBIDDEN", "Bạn không có quyền quản trị.");
  }
  return user;
}

export async function revokeToken(token: string | null): Promise<void> {
  if (!token) return;
  await query("UPDATE user_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [
    sha256(token),
  ]);
}

export async function deleteAccount(user: SessionUser, confirm: boolean, version: number): Promise<void> {
  const client = await getPool().connect();
  let keys: string[] = [];
  let sessionIds: string[] = [];
  try {
    await client.query("BEGIN");
    const current = await client.query<{ version: number }>("SELECT version FROM users WHERE id = $1 FOR UPDATE", [user.id]);
    const row = current.rows[0];
    if (!row || !deletionAllowed({ confirm, version, currentVersion: row.version })) {
      throw new AppError(409, "CONFLICT", "Xác nhận xoá tài khoản không khớp phiên bản hiện tại.");
    }
    const files = await client.query<{ key: string }>(
      `SELECT storage_key AS key FROM audio_assets WHERE owner_user_id = $1
       UNION SELECT w.storage_key FROM waveforms w JOIN audio_assets a ON a.id = w.asset_id WHERE a.owner_user_id = $1
       UNION SELECT storage_key FROM export_artifacts WHERE owner_user_id = $1 AND storage_key IS NOT NULL
       UNION SELECT h.storage_key FROM handoff_packages h JOIN wedding_plans p ON p.id = h.plan_id
         WHERE p.owner_user_id = $1 AND h.storage_key IS NOT NULL
       UNION SELECT temp_storage_key FROM upload_jobs WHERE owner_user_id = $1 AND temp_storage_key IS NOT NULL`,
      [user.id],
    );
    keys = files.rows.map((file) => file.key);
    const sessions = await client.query<{ id: string }>(
      "SELECT id::text AS id FROM audio_edit_sessions WHERE owner_user_id = $1",
      [user.id],
    );
    sessionIds = sessions.rows.map((row) => row.id);
    await client.query(
      "DELETE FROM playlist_items WHERE playlist_id IN (SELECT id FROM playlists WHERE owner_user_id = $1)",
      [user.id],
    );
    await client.query(
      `DELETE FROM music_cues WHERE stage_id IN (
         SELECT s.id FROM wedding_stages s JOIN wedding_plans p ON p.id = s.plan_id WHERE p.owner_user_id = $1
       )`,
      [user.id],
    );
    await client.query("DELETE FROM users WHERE id = $1", [user.id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await Promise.all(keys.map((key) => removeStorage(key).catch(() => undefined)));
  await Promise.all(sessionIds.map((id) => removeTemporarySessionDir(id).catch(() => undefined)));
}
