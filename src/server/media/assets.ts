import { randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type { PoolClient, QueryResultRow } from "pg";
import { getPool, one, query } from "@/server/db";
import { AppError } from "@/server/errors";
import { sha256 } from "@/server/http";
import { buildWaveformPeaks } from "@/server/media/waveform";
import { probeAudioFile } from "@/server/media/probe";
import { REVISION_NAME_MAX, validateRevision } from "@/server/media/revision-rules";
import { renderRevisionMp3 } from "@/server/media/export-mp3";
import { getPublishedTrack } from "@/server/catalog";
import { deletionBlocked, quotaDecision } from "@/server/storage/quota";
import { newKey, readStorage, removeStorage, safePath, writeStorage } from "@/server/storage";

const PROCESSING_VERSION = 1;

export async function createUpload(input: {
  userId: string;
  filename: string;
  bytes: Buffer;
  idempotencyKey: string;
}) {
  const requestHash = sha256(Buffer.concat([Buffer.from(input.filename), input.bytes]));
  const existing = await beginIdempotency(input.userId, input.idempotencyKey, requestHash);
  if (existing) return existing;
  const user = await one<{ used: string; quota: string }>(
    `SELECT storage_used_bytes::text AS used, storage_quota_bytes::text AS quota FROM users WHERE id = $1`,
    [input.userId],
  );
  if (!user) throw new AppError(401, "UNAUTHENTICATED", "Bạn cần đăng nhập.");
  const decision = quotaDecision(Number(user.used), Number(user.quota), input.bytes.byteLength);
  if (decision) throw new AppError(413, decision, "Tệp vượt quá dung lượng cho phép.");
  const tempKey = newKey("temporary", path.extname(input.filename) || ".bin");
  await writeStorage(tempKey, input.bytes);
  const jobId = randomUUID();
  await query(
    `INSERT INTO upload_jobs (id, owner_user_id, state, temp_storage_key, idempotency_key, original_filename)
     VALUES ($1, $2, 'PENDING', $3, $4, $5)`,
    [jobId, input.userId, tempKey, input.idempotencyKey, input.filename.slice(0, 255)],
  );
  const job = await processUploadJob(jobId);
  await finishIdempotency(input.userId, input.idempotencyKey, requestHash, 201, job);
  return job;
}

export async function processUploadJob(jobId: string) {
  const job = await one<{
    id: string;
    ownerUserId: string;
    state: string;
    tempStorageKey: string | null;
    originalFilename: string | null;
  }>(
    `SELECT id, owner_user_id AS "ownerUserId", state, temp_storage_key AS "tempStorageKey",
      original_filename AS "originalFilename"
     FROM upload_jobs WHERE id = $1`,
    [jobId],
  );
  if (!job) throw new AppError(404, "NOT_FOUND", "Không thấy lượt tải lên.");
  if (job.state === "CANCELLED" || job.state === "READY") return getUploadJob(jobId);
  if (!job.tempStorageKey) {
    await markUpload(jobId, "FAILED", "MISSING_FILE");
    return getUploadJob(jobId);
  }
  await query("UPDATE upload_jobs SET state = 'PROCESSING', updated_at = now() WHERE id = $1", [jobId]);
  const probed = await probeAudioFile(safePath(job.tempStorageKey));
  if (!probed.ok) {
    await removeStorage(job.tempStorageKey);
    await markUpload(jobId, "FAILED", probed.code);
    return getUploadJob(jobId);
  }
  const extension = probed.format === "MP3" ? ".mp3" : ".wav";
  const storageKey = newKey("source-audio", extension);
  const bytes = await readStorage(job.tempStorageKey);
  await writeStorage(storageKey, bytes);
  await removeStorage(job.tempStorageKey);
  const assetId = randomUUID();
  const waveKey = newKey("waveforms", ".json");
  const client = await getPool().connect();
  let committed = false;
  try {
    const peaks = await buildWaveformPeaks(safePath(storageKey), 160);
    await writeStorage(waveKey, Buffer.from(JSON.stringify(peaks)));
    await client.query("BEGIN");
    if (!(await chargeStorage(client, job.ownerUserId, probed.byteSize))) {
      await client.query("ROLLBACK");
      await markUpload(jobId, "FAILED", "QUOTA_EXCEEDED");
      return getUploadJob(jobId);
    }
    await client.query(
      `INSERT INTO audio_assets (
        id, owner_user_id, source_type, status, original_filename, media_format, duration_ms,
        sample_rate, channels, byte_size, storage_key, content_hash
      ) VALUES ($1,$2,'UPLOAD','READY',$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        assetId,
        job.ownerUserId,
        job.originalFilename,
        probed.format,
        probed.durationMs,
        probed.sampleRate,
        probed.channels,
        probed.byteSize,
        storageKey,
        sha256(bytes),
      ],
    );
    await client.query(
      `INSERT INTO waveforms (asset_id, storage_key, bucket_count) VALUES ($1, $2, $3)`,
      [assetId, waveKey, peaks.length],
    );
    await client.query(
      `UPDATE upload_jobs SET state = 'READY', asset_id = $2, temp_storage_key = NULL, updated_at = now() WHERE id = $1`,
      [jobId, assetId],
    );
    await client.query("COMMIT");
    committed = true;
  } catch (error) {
    await client.query("ROLLBACK");
    await markUpload(jobId, "FAILED", "PROCESSING_FAILED");
    throw error;
  } finally {
    client.release();
    if (!committed) {
      await removeStorage(storageKey).catch(() => undefined);
      await removeStorage(waveKey).catch(() => undefined);
    }
  }
  return getUploadJob(jobId);
}

async function chargeStorage(client: PoolClient, userId: string, bytes: number) {
  const charged = await client.query(
    `UPDATE users SET storage_used_bytes = storage_used_bytes + $2, updated_at = now()
     WHERE id = $1 AND storage_used_bytes + $2 <= storage_quota_bytes RETURNING id`,
    [userId, bytes],
  );
  return Boolean(charged.rowCount);
}

async function markUpload(jobId: string, state: string, errorCode: string) {
  await query("UPDATE upload_jobs SET state = $2, error_code = $3, updated_at = now() WHERE id = $1", [
    jobId,
    state,
    errorCode,
  ]);
}

export async function getUploadJob(jobId: string) {
  const job = await one(
    `SELECT id, owner_user_id AS "ownerUserId", asset_id AS "assetId", state, error_code AS "errorCode"
     FROM upload_jobs WHERE id = $1`,
    [jobId],
  );
  if (!job) throw new AppError(404, "NOT_FOUND", "Không thấy lượt tải lên.");
  return job;
}

export async function cancelUpload(userId: string, jobId: string) {
  const job = await ownedJob(userId, jobId);
  if (job.state === "READY") throw new AppError(409, "ALREADY_READY", "Tệp đã xử lý xong.");
  await query("UPDATE upload_jobs SET state = 'CANCELLED', updated_at = now() WHERE id = $1", [jobId]);
  return getUploadJob(jobId);
}

export async function retryUpload(userId: string, jobId: string) {
  const job = await ownedJob(userId, jobId);
  if (job.state !== "FAILED") throw new AppError(409, "NOT_RETRYABLE", "Chỉ thử lại được lượt đã thất bại.");
  return getUploadJob(jobId);
}

async function ownedJob(userId: string, jobId: string) {
  const job = await one<{ state: string; ownerUserId: string }>(
    `SELECT state, owner_user_id AS "ownerUserId" FROM upload_jobs WHERE id = $1`,
    [jobId],
  );
  if (!job || job.ownerUserId !== userId) throw new AppError(404, "NOT_FOUND", "Không thấy lượt tải lên.");
  return job;
}

export async function getOwnedAsset(userId: string, assetId: string) {
  const asset = await one<{
    id: string;
    ownerUserId: string | null;
    sourceType: string;
    status: string;
    durationMs: number | null;
    storageKey: string;
    mediaFormat: string | null;
    byteSize: string;
    originalFilename: string | null;
  }>(
    `SELECT id, owner_user_id AS "ownerUserId", source_type AS "sourceType", status, duration_ms AS "durationMs",
      storage_key AS "storageKey", media_format AS "mediaFormat", byte_size::text AS "byteSize",
      original_filename AS "originalFilename"
     FROM audio_assets WHERE id = $1`,
    [assetId],
  );
  if (!asset || asset.ownerUserId !== userId) throw new AppError(404, "NOT_FOUND", "Không thấy tệp nhạc.");
  return asset;
}

type LibraryExport = { id: string; revisionId: string; state: string; errorCode: string | null; durationMs: number | null; createdAt: string };
type LibraryRevision = {
  id: string;
  assetId: string;
  name: string | null;
  trimStartMs: number;
  trimEndMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  gainDb: number;
  createdAt: string;
  exports: LibraryExport[];
};

export async function listLibrary(userId: string, q: string, sourceType: string, status: string) {
  const assets = await listLibraryAssets(userId, q, sourceType, status);
  if (assets.length === 0) return [];
  const assetIds = assets.map((asset) => asset.id);
  const [revisions, exports] = await Promise.all([
    query<Omit<LibraryRevision, "exports">>(
      `SELECT id, asset_id AS "assetId", name, trim_start_ms AS "trimStartMs", trim_end_ms AS "trimEndMs",
        fade_in_ms AS "fadeInMs", fade_out_ms AS "fadeOutMs", gain_db::float8 AS "gainDb", created_at AS "createdAt"
       FROM audio_revisions WHERE owner_user_id = $1 AND asset_id = ANY($2::uuid[]) ORDER BY created_at DESC`,
      [userId, assetIds],
    ),
    query<LibraryExport>(
      `SELECT e.id, e.revision_id AS "revisionId", e.state, e.error_code AS "errorCode", e.duration_ms AS "durationMs",
        e.created_at AS "createdAt"
       FROM export_artifacts e JOIN audio_revisions r ON r.id = e.revision_id
       WHERE e.owner_user_id = $1 AND r.asset_id = ANY($2::uuid[]) ORDER BY e.created_at DESC`,
      [userId, assetIds],
    ),
  ]);
  const exportsByRevision = new Map<string, LibraryExport[]>();
  for (const item of exports) {
    const list = exportsByRevision.get(item.revisionId) ?? [];
    list.push(item);
    exportsByRevision.set(item.revisionId, list);
  }
  const revisionsByAsset = new Map<string, LibraryRevision[]>();
  for (const revision of revisions) {
    const list = revisionsByAsset.get(revision.assetId) ?? [];
    list.push({ ...revision, exports: exportsByRevision.get(revision.id) ?? [] });
    revisionsByAsset.set(revision.assetId, list);
  }
  return assets.map((asset) => ({ ...asset, revisions: revisionsByAsset.get(asset.id) ?? [] }));
}

async function listLibraryAssets(userId: string, q: string, sourceType: string, status: string) {
  return query<{
    id: string;
    sourceType: string;
    status: string;
    originalFilename: string | null;
    mediaFormat: string | null;
    durationMs: number | null;
    byteSize: string;
    createdAt: string;
  }>(
    `SELECT id, source_type AS "sourceType", status, original_filename AS "originalFilename",
      media_format AS "mediaFormat", duration_ms AS "durationMs", byte_size::text AS "byteSize", created_at AS "createdAt"
     FROM audio_assets
     WHERE owner_user_id = $1
       AND ($2 = '' OR vi_fold(coalesce(original_filename, '')) LIKE '%' || vi_fold($2) || '%')
       AND ($3 = '' OR source_type = $3)
       AND ($4 = '' OR status = $4)
     ORDER BY created_at DESC`,
    [userId, q, sourceType, status],
  );
}

export async function storageUsage(userId: string) {
  return one(
    `SELECT storage_used_bytes::text AS "storageUsedBytes", storage_quota_bytes::text AS "storageQuotaBytes"
     FROM users WHERE id = $1`,
    [userId],
  );
}

export async function waveformForAsset(userId: string, assetId: string) {
  await getOwnedAsset(userId, assetId);
  const wave = await one<{ storageKey: string }>(
    `SELECT storage_key AS "storageKey" FROM waveforms WHERE asset_id = $1`,
    [assetId],
  );
  if (!wave) throw new AppError(404, "NOT_FOUND", "Chưa có sóng nhạc.");
  const peaks = JSON.parse((await readStorage(wave.storageKey)).toString("utf8")) as number[];
  return { bucketCount: peaks.length, peaks };
}

export async function saveRevision(input: {
  userId: string;
  assetId: string;
  idempotencyKey: string;
  trimStartMs: number;
  trimEndMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  gainDb: number;
  name?: string | null;
}) {
  const asset = await getOwnedAsset(input.userId, input.assetId);
  if (asset.status !== "READY" || asset.durationMs === null) {
    throw new AppError(422, "ASSET_NOT_READY", "Nguồn nhạc chưa sẵn sàng để sửa.");
  }
  const problem = validateRevision(input, asset.durationMs);
  if (problem) throw new AppError(422, problem, "Thông số cắt nhạc không hợp lệ.");
  const name = input.name?.trim() || null;
  if (name && name.length > REVISION_NAME_MAX) {
    throw new AppError(422, "NAME_TOO_LONG", `Tên bản chỉnh tối đa ${REVISION_NAME_MAX} ký tự.`);
  }
  const requestHash = sha256(JSON.stringify({ ...input, name, userId: undefined, idempotencyKey: undefined }));
  const existing = await beginIdempotency(input.userId, input.idempotencyKey, requestHash);
  if (existing) return existing;
  const id = randomUUID();
  const revision = await one(
    `INSERT INTO audio_revisions (
      id, asset_id, owner_user_id, trim_start_ms, trim_end_ms, fade_in_ms, fade_out_ms, gain_db, processing_version, name
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING id, asset_id AS "assetId", name, trim_start_ms AS "trimStartMs", trim_end_ms AS "trimEndMs",
      fade_in_ms AS "fadeInMs", fade_out_ms AS "fadeOutMs", gain_db AS "gainDb",
      processing_version AS "processingVersion", created_at AS "createdAt"`,
    [
      id,
      input.assetId,
      input.userId,
      input.trimStartMs,
      input.trimEndMs,
      input.fadeInMs,
      input.fadeOutMs,
      input.gainDb,
      PROCESSING_VERSION,
      name,
    ],
  );
  await finishIdempotency(input.userId, input.idempotencyKey, requestHash, 201, revision);
  return revision;
}

export async function listRevisions(userId: string, assetId: string) {
  await getOwnedAsset(userId, assetId);
  return query(
    `SELECT id, name, trim_start_ms AS "trimStartMs", trim_end_ms AS "trimEndMs", fade_in_ms AS "fadeInMs",
      fade_out_ms AS "fadeOutMs", gain_db AS "gainDb", processing_version AS "processingVersion",
      created_at AS "createdAt"
     FROM audio_revisions WHERE asset_id = $1 AND owner_user_id = $2 ORDER BY created_at`,
    [assetId, userId],
  );
}

export async function getRevision(userId: string, revisionId: string) {
  const revision = await one<{
    id: string;
    assetId: string;
    ownerUserId: string;
    name: string | null;
    trimStartMs: number;
    trimEndMs: number;
    fadeInMs: number;
    fadeOutMs: number;
    gainDb: string;
    storageKey: string;
  }>(
    `SELECT r.id, r.asset_id AS "assetId", r.owner_user_id AS "ownerUserId", r.name, r.trim_start_ms AS "trimStartMs",
      r.trim_end_ms AS "trimEndMs", r.fade_in_ms AS "fadeInMs", r.fade_out_ms AS "fadeOutMs",
      r.gain_db::text AS "gainDb", a.storage_key AS "storageKey"
     FROM audio_revisions r JOIN audio_assets a ON a.id = r.asset_id WHERE r.id = $1`,
    [revisionId],
  );
  if (!revision || revision.ownerUserId !== userId) throw new AppError(404, "NOT_FOUND", "Không thấy bản chỉnh.");
  return revision;
}

const EXPORT_LEASE_MINUTES = 3;
const CANCEL_POLL_MS = 250;
const MAX_QUEUED_EXPORTS = 5;
const EXPORT_BYTES_PER_MS = 24;
const runningExports = new Map<string, AbortController>();

async function withUserLock<T>(userId: string, work: (client: PoolClient, user: { used: number; quota: number }) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<{ used: string; quota: string }>(
      `SELECT storage_used_bytes::text AS used, storage_quota_bytes::text AS quota FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    if (!locked.rows[0]) throw new AppError(401, "UNAUTHENTICATED", "Bạn cần đăng nhập.");
    const result = await work(client, { used: Number(locked.rows[0].used), quota: Number(locked.rows[0].quota) });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function recoverAllStaleExports() {
  await query(
    `UPDATE export_artifacts SET state = 'FAILED', error_code = 'STALE_JOB', updated_at = now()
     WHERE state IN ('PROCESSING', 'VERIFYING') AND updated_at < now() - make_interval(mins => $1)`,
    [EXPORT_LEASE_MINUTES],
  );
}

async function recoverStaleExports(client: PoolClient, userId: string) {
  await client.query(
    `UPDATE export_artifacts SET state = 'FAILED', error_code = 'STALE_JOB', updated_at = now()
     WHERE owner_user_id = $1 AND state IN ('PROCESSING', 'VERIFYING')
       AND updated_at < now() - make_interval(mins => $2)`,
    [userId, EXPORT_LEASE_MINUTES],
  );
}

async function assertExportFits(client: PoolClient, userId: string, user: { used: number; quota: number }, clipMs: number) {
  const open = await client.query<{ reserved: string }>(
    `SELECT coalesce(sum(r.trim_end_ms - r.trim_start_ms), 0)::text AS reserved
     FROM export_artifacts e JOIN audio_revisions r ON r.id = e.revision_id
     WHERE e.owner_user_id = $1 AND e.state IN ('QUEUED', 'PROCESSING', 'VERIFYING')`,
    [userId],
  );
  const estimate = (Number(open.rows[0]?.reserved ?? 0) + clipMs) * EXPORT_BYTES_PER_MS;
  const decision = quotaDecision(user.used, user.quota, estimate);
  if (decision) throw new AppError(413, decision, "Bản xuất vượt quá dung lượng còn lại.");
}

async function assertQueueRoom(client: PoolClient, userId: string) {
  await recoverStaleExports(client, userId);
  const counts = await client.query<{ queued: string }>(
    `SELECT count(*)::text AS queued FROM export_artifacts WHERE owner_user_id = $1 AND state = 'QUEUED'`,
    [userId],
  );
  if (Number(counts.rows[0]?.queued ?? 0) >= MAX_QUEUED_EXPORTS) {
    throw new AppError(409, "EXPORT_QUEUE_FULL", "Hàng đợi xuất đã đủ năm việc.");
  }
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

export async function queueExport(userId: string, revisionId: string, idempotencyKey: string) {
  const revision = await getRevision(userId, revisionId);
  const requestHash = sha256(revisionId);
  const existing = await beginIdempotency(userId, idempotencyKey, requestHash);
  if (existing) return existing;
  const id = await withUserLock(userId, async (client, user) => {
    const stored = await client.query<{ id: string; revisionId: string }>(
      `SELECT id, revision_id AS "revisionId" FROM export_artifacts WHERE owner_user_id = $1 AND idempotency_key = $2`,
      [userId, idempotencyKey],
    );
    if (stored.rows[0]) {
      if (stored.rows[0].revisionId !== revision.id) {
        throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "Khóa thử lại đang được dùng cho một nội dung khác.");
      }
      return stored.rows[0].id;
    }
    await assertQueueRoom(client, userId);
    await assertExportFits(client, userId, user, revision.trimEndMs - revision.trimStartMs);
    const created = randomUUID();
    await client.query(
      `INSERT INTO export_artifacts (id, revision_id, owner_user_id, state, idempotency_key)
       VALUES ($1, $2, $3, 'QUEUED', $4)`,
      [created, revision.id, userId, idempotencyKey],
    );
    return created;
  });
  const artifact = await getExport(userId, id);
  await finishIdempotency(userId, idempotencyKey, requestHash, 201, artifact);
  scheduleDrain(userId);
  return artifact;
}

function scheduleDrain(userId: string) {
  void drainUserExports(userId).catch((error) => console.error(error));
}

async function claimNextUserExport(userId: string) {
  return withUserLock(userId, async (client) => {
    await recoverStaleExports(client, userId);
    try {
      const claimed = await client.query<{ id: string }>(
        `UPDATE export_artifacts SET state = 'PROCESSING', progress = 10, updated_at = now()
         WHERE id = (
           SELECT id FROM export_artifacts WHERE owner_user_id = $1 AND state = 'QUEUED'
           ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
         )
         AND NOT EXISTS (
           SELECT 1 FROM export_artifacts WHERE owner_user_id = $1 AND state IN ('PROCESSING', 'VERIFYING')
         )
         RETURNING id`,
        [userId],
      );
      return claimed.rows[0]?.id ?? null;
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  });
}

const userDrains = new Map<string, { tail: Promise<void>; waiting: boolean }>();

export function drainUserExports(userId: string) {
  const known = userDrains.get(userId);
  if (known?.waiting) return known.tail;
  const entry = { tail: Promise.resolve(), waiting: true };
  entry.tail = (known?.tail ?? Promise.resolve()).catch(() => undefined).then(async () => {
    entry.waiting = false;
    for (;;) {
      const next = await claimNextUserExport(userId);
      if (!next) return;
      await processExport(next, true);
    }
  });
  userDrains.set(userId, entry);
  void entry.tail.finally(() => {
    if (userDrains.get(userId) === entry) userDrains.delete(userId);
  }).catch(() => undefined);
  return entry.tail;
}

export async function processExport(exportId: string, alreadyClaimed = false) {
  const controller = new AbortController();
  runningExports.set(exportId, controller);
  try {
    return await runExport(exportId, alreadyClaimed, controller);
  } finally {
    runningExports.delete(exportId);
  }
}

async function runExport(exportId: string, alreadyClaimed: boolean, controller: AbortController) {
  const artifact = await one<{
    id: string;
    state: string;
    revisionId: string;
    ownerUserId: string;
    storageKey: string;
    trimStartMs: number;
    trimEndMs: number;
    fadeInMs: number;
    fadeOutMs: number;
    gainDb: string;
  }>(
    `SELECT e.id, e.state, e.revision_id AS "revisionId", e.owner_user_id AS "ownerUserId", a.storage_key AS "storageKey",
      r.trim_start_ms AS "trimStartMs", r.trim_end_ms AS "trimEndMs", r.fade_in_ms AS "fadeInMs",
      r.fade_out_ms AS "fadeOutMs", r.gain_db::text AS "gainDb"
     FROM export_artifacts e
     JOIN audio_revisions r ON r.id = e.revision_id
     JOIN audio_assets a ON a.id = r.asset_id
     WHERE e.id = $1`,
    [exportId],
  );
  if (!artifact) throw new AppError(404, "NOT_FOUND", "Không thấy việc xuất.");
  if (!alreadyClaimed) {
    const claimed = await query(
      `UPDATE export_artifacts SET state = 'PROCESSING', progress = 40, updated_at = now()
       WHERE id = $1 AND state = 'QUEUED' RETURNING id`,
      [exportId],
    ).catch((error) => {
      if (isUniqueViolation(error)) return [];
      throw error;
    });
    if (!claimed.length) return getExport(artifact.ownerUserId, exportId);
  } else if (artifact.state !== "PROCESSING") {
    return getExport(artifact.ownerUserId, exportId);
  }
  const outputKey = newKey("exports", ".mp3");
  const watcher = setInterval(() => {
    void one<{ state: string }>("SELECT state FROM export_artifacts WHERE id = $1", [exportId])
      .then((row) => {
        if (!row || !["PROCESSING", "VERIFYING"].includes(row.state)) controller.abort();
      })
      .catch(() => undefined);
  }, CANCEL_POLL_MS);
  let kept = false;
  try {
    await mkdir(path.dirname(safePath(outputKey)), { recursive: true });
    const rendered = await renderRevisionMp3({
      sourcePath: safePath(artifact.storageKey),
      outputPath: safePath(outputKey),
      trimStartMs: artifact.trimStartMs,
      trimEndMs: artifact.trimEndMs,
      fadeInMs: artifact.fadeInMs,
      fadeOutMs: artifact.fadeOutMs,
      gainDb: Number(artifact.gainDb),
      signal: controller.signal,
    });
    const verifying = await query(
      `UPDATE export_artifacts SET state = 'VERIFYING', progress = 80, updated_at = now()
       WHERE id = $1 AND state = 'PROCESSING' RETURNING id`,
      [exportId],
    );
    if (!verifying.length) return getExport(artifact.ownerUserId, exportId);
    const expected = artifact.trimEndMs - artifact.trimStartMs;
    if (rendered.codec !== "mp3" || Math.abs(rendered.durationMs - expected) > 200) {
      await query(
        `UPDATE export_artifacts SET state = 'FAILED', error_code = 'VERIFY_FAILED', updated_at = now()
         WHERE id = $1 AND state = 'VERIFYING'`,
        [exportId],
      );
    } else {
      const { size } = await stat(safePath(outputKey));
      kept = await completeExport(exportId, artifact.ownerUserId, outputKey, rendered.durationMs, size);
    }
  } catch (error) {
    await query(
      `UPDATE export_artifacts SET state = 'FAILED', error_code = 'RENDER_FAILED', updated_at = now()
       WHERE id = $1 AND state IN ('PROCESSING', 'VERIFYING')`,
      [exportId],
    );
    if (!controller.signal.aborted) console.error(error);
  } finally {
    clearInterval(watcher);
    if (!kept) await removeStorage(outputKey);
  }
  return getExport(artifact.ownerUserId, exportId);
}

async function completeExport(exportId: string, ownerUserId: string, outputKey: string, durationMs: number, byteSize: number) {
  return withUserLock(ownerUserId, async (client, user) => {
    if (quotaDecision(user.used, user.quota, byteSize)) {
      await client.query(
        `UPDATE export_artifacts SET state = 'FAILED', error_code = 'QUOTA_EXCEEDED', updated_at = now()
         WHERE id = $1 AND state = 'VERIFYING'`,
        [exportId],
      );
      return false;
    }
    const done = await client.query(
      `UPDATE export_artifacts
       SET state = 'COMPLETED', progress = 100, storage_key = $2, duration_ms = $3, byte_size = $4, error_code = NULL, updated_at = now()
       WHERE id = $1 AND state = 'VERIFYING'`,
      [exportId, outputKey, durationMs, byteSize],
    );
    if (!done.rowCount) return false;
    await client.query(`UPDATE users SET storage_used_bytes = storage_used_bytes + $2 WHERE id = $1`, [ownerUserId, byteSize]);
    return true;
  });
}

export async function getExport(userId: string, exportId: string) {
  const artifact = await one<{
    id: string;
    revisionId: string;
    state: string;
    progress: number;
    errorCode: string | null;
    durationMs: number | null;
    createdAt: string;
  }>(
    `SELECT id, revision_id AS "revisionId", state, progress, error_code AS "errorCode",
      duration_ms AS "durationMs", created_at AS "createdAt"
     FROM export_artifacts WHERE id = $1 AND owner_user_id = $2`,
    [exportId, userId],
  );
  if (!artifact) throw new AppError(404, "NOT_FOUND", "Không thấy bản xuất.");
  return artifact;
}

export async function pollExport(userId: string, exportId: string) {
  const artifact = await getExport(userId, exportId);
  if (artifact.state === "QUEUED") scheduleDrain(userId);
  return artifact;
}

export async function latestExport(userId: string, revisionId: string) {
  return one<{ id: string; state: string; errorCode: string | null; durationMs: number | null; progress: number }>(
    `SELECT id, state, error_code AS "errorCode", duration_ms AS "durationMs", progress
     FROM export_artifacts WHERE revision_id = $1 AND owner_user_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [revisionId, userId],
  );
}

export async function exportFile(userId: string, exportId: string) {
  const artifact = await one<{ state: string; storageKey: string | null }>(
    `SELECT state, storage_key AS "storageKey" FROM export_artifacts WHERE id = $1 AND owner_user_id = $2`,
    [exportId, userId],
  );
  if (!artifact) throw new AppError(404, "NOT_FOUND", "Không thấy bản xuất.");
  if (artifact.state !== "COMPLETED" || !artifact.storageKey) {
    throw new AppError(409, "NOT_READY", "Bản MP3 chưa sẵn sàng.");
  }
  return readStorage(artifact.storageKey);
}

export async function cancelExport(userId: string, exportId: string) {
  await getExport(userId, exportId);
  const cancelled = await query(
    `UPDATE export_artifacts SET state = 'CANCELLED', updated_at = now()
     WHERE id = $1 AND owner_user_id = $2 AND state IN ('QUEUED', 'PROCESSING', 'VERIFYING') RETURNING id`,
    [exportId, userId],
  );
  if (!cancelled.length) throw new AppError(409, "NOT_CANCELLABLE", "Bản xuất đã kết thúc, không huỷ được.");
  runningExports.get(exportId)?.abort();
  scheduleDrain(userId);
  return getExport(userId, exportId);
}

export async function retryExport(userId: string, exportId: string) {
  await getExport(userId, exportId);
  await withUserLock(userId, async (client, user) => {
    await assertQueueRoom(client, userId);
    const clip = await client.query<{ clipMs: number }>(
      `SELECT r.trim_end_ms - r.trim_start_ms AS "clipMs" FROM export_artifacts e
       JOIN audio_revisions r ON r.id = e.revision_id WHERE e.id = $1 AND e.owner_user_id = $2`,
      [exportId, userId],
    );
    await assertExportFits(client, userId, user, Number(clip.rows[0]?.clipMs ?? 0));
    const reset = await client.query(
      `UPDATE export_artifacts SET state = 'QUEUED', progress = 0, error_code = NULL, storage_key = NULL, duration_ms = NULL,
         byte_size = NULL, updated_at = now()
       WHERE id = $1 AND owner_user_id = $2 AND state = 'FAILED' RETURNING id`,
      [exportId, userId],
    );
    if (!reset.rowCount) throw new AppError(409, "NOT_RETRYABLE", "Chỉ thử lại được bản xuất đã thất bại.");
  });
  scheduleDrain(userId);
  return getExport(userId, exportId);
}

export async function assetDependencies(assetId: string, client?: PoolClient): Promise<string[]> {
  const run = client
    ? async <T extends QueryResultRow>(text: string, values: unknown[]) => (await client.query<T>(text, values)).rows
    : query;
  const rows = await run<{ name: string }>(
    `SELECT DISTINCT p.name FROM music_cues c
     JOIN wedding_stages s ON s.id = c.stage_id
     JOIN wedding_plans p ON p.id = s.plan_id
     JOIN audio_revisions r ON r.id = c.revision_id
     WHERE r.asset_id = $1
     UNION
     SELECT DISTINCT pl.name FROM playlist_items i
     JOIN playlists pl ON pl.id = i.playlist_id
     JOIN audio_revisions r ON r.id = i.revision_id
     WHERE r.asset_id = $1`,
    [assetId],
  );
  return rows.map((row) => row.name);
}

export async function deleteAsset(userId: string, assetId: string) {
  await getOwnedAsset(userId, assetId);
  const client = await getPool().connect();
  let keys: string[] = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const locked = await client.query<{ byteSize: string }>(
      `SELECT byte_size::text AS "byteSize" FROM audio_assets WHERE id = $1 AND owner_user_id = $2 FOR UPDATE`,
      [assetId, userId],
    );
    if (!locked.rows[0]) throw new AppError(404, "NOT_FOUND", "Không thấy tệp nhạc.");
    const names = await assetDependencies(assetId, client);
    const blocked = deletionBlocked(names);
    if (blocked) {
      throw new AppError(409, blocked.code, "Tệp đang được kế hoạch hoặc danh sách dùng.", blocked);
    }
    const files = await client.query<{ storageKey: string }>(
      `SELECT storage_key AS "storageKey" FROM audio_assets WHERE id = $1
       UNION SELECT storage_key FROM waveforms WHERE asset_id = $1
       UNION SELECT storage_key FROM export_artifacts e
         JOIN audio_revisions r ON r.id = e.revision_id
         WHERE r.asset_id = $1 AND e.storage_key IS NOT NULL`,
      [assetId],
    );
    keys = files.rows.map((file) => file.storageKey);
    const exported = await client.query<{ bytes: string }>(
      `SELECT coalesce(sum(e.byte_size), 0)::text AS bytes FROM export_artifacts e
       JOIN audio_revisions r ON r.id = e.revision_id
       WHERE r.asset_id = $1 AND e.state = 'COMPLETED'`,
      [assetId],
    );
    await client.query("DELETE FROM audio_assets WHERE id = $1", [assetId]);
    await client.query(
      `UPDATE users SET storage_used_bytes = GREATEST(0, storage_used_bytes - $2) WHERE id = $1`,
      [userId, Number(locked.rows[0].byteSize) + Number(exported.rows[0].bytes)],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23503") {
      throw new AppError(409, "ASSET_IN_USE", "Tệp đang được kế hoạch hoặc danh sách dùng.", { plans: await assetDependencies(assetId) });
    }
    throw error;
  } finally {
    client.release();
  }
  await Promise.all(keys.map((key) => removeStorage(key).catch(() => undefined)));
}

async function revisionDependencies(revisionId: string, client: PoolClient): Promise<string[]> {
  const { rows } = await client.query<{ name: string }>(
    `SELECT DISTINCT p.name FROM music_cues c
     JOIN wedding_stages s ON s.id = c.stage_id
     JOIN wedding_plans p ON p.id = s.plan_id
     WHERE c.revision_id = $1
     UNION
     SELECT DISTINCT pl.name FROM playlist_items i
     JOIN playlists pl ON pl.id = i.playlist_id
     WHERE i.revision_id = $1`,
    [revisionId],
  );
  return rows.map((row) => row.name);
}

export async function deleteRevision(userId: string, revisionId: string) {
  await getRevision(userId, revisionId);
  const client = await getPool().connect();
  let keys: string[] = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const locked = await client.query(
      `SELECT id FROM audio_revisions WHERE id = $1 AND owner_user_id = $2 FOR UPDATE`,
      [revisionId, userId],
    );
    if (!locked.rows[0]) throw new AppError(404, "NOT_FOUND", "Không thấy bản chỉnh.");
    const names = await revisionDependencies(revisionId, client);
    if (names.length > 0) {
      throw new AppError(409, "REVISION_IN_USE", "Bản chỉnh đang được kế hoạch hoặc danh sách dùng.", { plans: names });
    }
    const active = await client.query(
      `SELECT 1 FROM export_artifacts WHERE revision_id = $1 AND state IN ('QUEUED', 'PROCESSING', 'VERIFYING') LIMIT 1`,
      [revisionId],
    );
    if (active.rows[0]) {
      throw new AppError(409, "EXPORT_IN_PROGRESS", "Bản chỉnh đang xuất MP3. Hãy huỷ hoặc đợi xuất xong rồi xoá.");
    }
    const files = await client.query<{ storageKey: string }>(
      `SELECT storage_key AS "storageKey" FROM export_artifacts WHERE revision_id = $1 AND storage_key IS NOT NULL`,
      [revisionId],
    );
    keys = files.rows.map((file) => file.storageKey);
    const exported = await client.query<{ bytes: string }>(
      `SELECT coalesce(sum(byte_size), 0)::text AS bytes FROM export_artifacts WHERE revision_id = $1 AND state = 'COMPLETED'`,
      [revisionId],
    );
    await client.query("DELETE FROM audio_revisions WHERE id = $1", [revisionId]);
    await client.query(
      `UPDATE users SET storage_used_bytes = GREATEST(0, storage_used_bytes - $2) WHERE id = $1`,
      [userId, Number(exported.rows[0].bytes)],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23503") {
      throw new AppError(409, "REVISION_IN_USE", "Bản chỉnh đang được kế hoạch hoặc danh sách dùng.");
    }
    throw error;
  } finally {
    client.release();
  }
  await Promise.all(keys.map((key) => removeStorage(key).catch(() => undefined)));
}

async function beginIdempotency(userId: string, key: string, requestHash: string) {
  const existing = await one<{ requestHash: string; responseBody: unknown }>(
    `SELECT request_hash AS "requestHash", response_body AS "responseBody"
     FROM idempotency_records WHERE user_id = $1 AND key = $2`,
    [userId, key],
  );
  if (!existing) return null;
  if (existing.requestHash !== requestHash) {
    throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "Khóa thử lại đang được dùng cho một nội dung khác.");
  }
  return existing.responseBody;
}

async function finishIdempotency(userId: string, key: string, requestHash: string, status: number, body: unknown) {
  await query(
    `INSERT INTO idempotency_records (user_id, key, request_hash, response_status, response_body)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, key) DO NOTHING`,
    [userId, key, requestHash, status, body],
  );
}

export async function catalogCopiesForTracks(userId: string, trackIds: string[]) {
  if (trackIds.length === 0) return new Map<string, string>();
  const rows = await query<{ catalogTrackId: string; id: string }>(
    `SELECT catalog_track_id AS "catalogTrackId", id
     FROM audio_assets
     WHERE owner_user_id = $1 AND catalog_track_id = ANY($2::uuid[])`,
    [userId, trackIds],
  );
  return new Map(rows.map((row) => [row.catalogTrackId, row.id]));
}

function catalogLibraryFilename(title: string, format: string | null) {
  const extension = format === "MP3" ? ".mp3" : format === "WAV" ? ".wav" : "";
  const clean = title.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim() || "Bai nhac";
  return `${clean.slice(0, 255 - extension.length)}${extension}`;
}

async function ownedCatalogCopy(userId: string, trackId: string) {
  return one<{ id: string }>(
    `SELECT id FROM audio_assets WHERE owner_user_id = $1 AND catalog_track_id = $2`,
    [userId, trackId],
  );
}

export async function saveCatalogTrackToLibrary(input: { userId: string; trackId: string; idempotencyKey: string }) {
  const requestHash = sha256(Buffer.from(input.trackId));
  const replay = await beginIdempotency(input.userId, input.idempotencyKey, requestHash);
  if (replay) return replay as { assetId: string; alreadySaved: boolean };

  const track = await getPublishedTrack(input.trackId);
  if (!track.previewable || !track.assetId) {
    throw new AppError(422, "NOT_AN_AUDIO_SOURCE", "Bài này chỉ có thông tin, chưa có file để đưa vào thư viện.");
  }
  const existing = await ownedCatalogCopy(input.userId, input.trackId);
  if (existing) {
    const body = { assetId: existing.id, alreadySaved: true };
    await finishIdempotency(input.userId, input.idempotencyKey, requestHash, 200, body);
    return body;
  }

  const source = await one<{
    mediaFormat: string | null;
    durationMs: number | null;
    sampleRate: number | null;
    channels: number | null;
    byteSize: string;
    storageKey: string;
    contentHash: string | null;
  }>(
    `SELECT media_format AS "mediaFormat", duration_ms AS "durationMs", sample_rate AS "sampleRate",
      channels, byte_size::text AS "byteSize", storage_key AS "storageKey", content_hash AS "contentHash"
     FROM audio_assets WHERE id = $1 AND source_type = 'CATALOG' AND status = 'READY'`,
    [track.assetId],
  );
  if (!source) {
    throw new AppError(422, "NOT_AN_AUDIO_SOURCE", "Bài này chỉ có thông tin, chưa có file để đưa vào thư viện.");
  }
  const wave = await one<{ storageKey: string; bucketCount: number }>(
    `SELECT storage_key AS "storageKey", bucket_count AS "bucketCount" FROM waveforms WHERE asset_id = $1`,
    [track.assetId],
  );
  const bytes = await readStorage(source.storageKey);
  const storageKey = newKey("source-audio", source.mediaFormat === "MP3" ? ".mp3" : ".wav");
  const waveKey = newKey("waveforms", ".json");
  await writeStorage(storageKey, bytes);
  let bucketCount = wave?.bucketCount ?? 0;
  if (wave) {
    await writeStorage(waveKey, await readStorage(wave.storageKey));
  } else {
    const peaks = await buildWaveformPeaks(safePath(storageKey), 160);
    bucketCount = peaks.length;
    await writeStorage(waveKey, Buffer.from(JSON.stringify(peaks)));
  }

  let assetId: string = randomUUID();
  let alreadySaved = false;
  let committed = false;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    if (!(await chargeStorage(client, input.userId, Number(source.byteSize)))) {
      throw new AppError(413, "QUOTA_EXCEEDED", "Tệp vượt quá dung lượng cho phép.");
    }
    await client.query(
      `INSERT INTO audio_assets (
        id, owner_user_id, source_type, status, original_filename, media_format, duration_ms,
        sample_rate, channels, byte_size, storage_key, content_hash, catalog_track_id
      ) VALUES ($1,$2,'CATALOG','READY',$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        assetId,
        input.userId,
        catalogLibraryFilename(track.title, source.mediaFormat),
        source.mediaFormat,
        source.durationMs,
        source.sampleRate,
        source.channels,
        source.byteSize,
        storageKey,
        source.contentHash ?? sha256(bytes),
        input.trackId,
      ],
    );
    await client.query(`INSERT INTO waveforms (asset_id, storage_key, bucket_count) VALUES ($1, $2, $3)`, [
      assetId,
      waveKey,
      bucketCount,
    ]);
    await client.query("COMMIT");
    committed = true;
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      const row = await ownedCatalogCopy(input.userId, input.trackId);
      if (row) {
        assetId = row.id;
        alreadySaved = true;
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  } finally {
    client.release();
    if (!committed) {
      await removeStorage(storageKey).catch(() => undefined);
      await removeStorage(waveKey).catch(() => undefined);
    }
  }
  const body = { assetId, alreadySaved };
  await finishIdempotency(input.userId, input.idempotencyKey, requestHash, alreadySaved ? 200 : 201, body);
  return body;
}

export async function registerReadyAsset(input: {
  userId: string;
  sourceType: "UPLOAD" | "YOUTUBE" | "CATALOG";
  filename: string;
  bytes: Buffer;
  youtubeVideoId?: string | null;
}) {
  if (input.sourceType !== "CATALOG") {
    const user = await one<{ used: string; quota: string }>(
      `SELECT storage_used_bytes::text AS used, storage_quota_bytes::text AS quota FROM users WHERE id = $1`,
      [input.userId],
    );
    if (!user) throw new AppError(401, "UNAUTHENTICATED", "Bạn cần đăng nhập.");
    const decision = quotaDecision(Number(user.used), Number(user.quota), input.bytes.byteLength);
    if (decision) throw new AppError(413, decision, "Tệp vượt quá dung lượng cho phép.");
  }
  const tempKey = newKey("temporary", ".bin");
  await writeStorage(tempKey, input.bytes);
  const probed = await probeAudioFile(safePath(tempKey));
  if (!probed.ok) {
    await removeStorage(tempKey);
    throw new AppError(422, probed.code, "Không đọc được tệp nhạc.");
  }
  const extension = probed.format === "MP3" ? ".mp3" : ".wav";
  const storageKey = newKey("source-audio", extension);
  await writeStorage(storageKey, input.bytes);
  await removeStorage(tempKey);
  const assetId = randomUUID();
  const waveKey = newKey("waveforms", ".json");
  const client = await getPool().connect();
  let committed = false;
  try {
    const peaks = await buildWaveformPeaks(safePath(storageKey), 160);
    await writeStorage(waveKey, Buffer.from(JSON.stringify(peaks)));
    await client.query("BEGIN");
    if (input.sourceType !== "CATALOG" && !(await chargeStorage(client, input.userId, probed.byteSize))) {
      throw new AppError(413, "QUOTA_EXCEEDED", "Tệp vượt quá dung lượng cho phép.");
    }
    await client.query(
      `INSERT INTO audio_assets (
        id, owner_user_id, source_type, status, original_filename, media_format, duration_ms,
        sample_rate, channels, byte_size, storage_key, content_hash, youtube_video_id
      ) VALUES ($1,$2,$3,'READY',$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        assetId,
        input.sourceType === "CATALOG" ? null : input.userId,
        input.sourceType,
        input.filename,
        probed.format,
        probed.durationMs,
        probed.sampleRate,
        probed.channels,
        probed.byteSize,
        storageKey,
        sha256(input.bytes),
        input.youtubeVideoId ?? null,
      ],
    );
    await client.query(`INSERT INTO waveforms (asset_id, storage_key, bucket_count) VALUES ($1, $2, $3)`, [
      assetId,
      waveKey,
      peaks.length,
    ]);
    await client.query("COMMIT");
    committed = true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    if (!committed) {
      await removeStorage(storageKey).catch(() => undefined);
      await removeStorage(waveKey).catch(() => undefined);
    }
  }
  return assetId;
}
