import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { one, query } from "@/server/db";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { registerReadyAsset } from "@/server/media/assets";
import { safePath } from "@/server/storage";
import { acquireYouTubeAudio, inspectAcquisition, type Acquirer } from "@/server/youtube/acquisition";
import { lookupYouTubeMetadata } from "@/server/youtube/metadata";
import { parseYouTubeUrl } from "@/server/youtube/url";

const FIXTURE_PREFIX = "fixture:";
const FIXTURE_NAME = /^[a-z0-9-]{1,40}$/;
const MAX_SOURCE_MS = 600_000;
const ACTIVE_STATES = "('PENDING','FETCHING_METADATA','DOWNLOADING','EXTRACTING_AUDIO','GENERATING_WAVEFORM')";

export async function createImport(
  userId: string,
  raw: string,
  idempotencyKey: string,
  acquire: Acquirer = acquireYouTubeAudio,
) {
  const fixture = raw.startsWith(FIXTURE_PREFIX) ? checkedFixture(raw) : null;
  const videoId = fixture ?? parsedVideoId(raw);
  const existing = await one(
    `SELECT id, state, acquisition_state AS "acquisitionState", error_code AS "errorCode", asset_id AS "assetId",
      title, channel_name AS "channelName", thumbnail_url AS "thumbnailUrl", duration_ms AS "durationMs",
      video_id AS "videoId"
     FROM youtube_import_jobs WHERE owner_user_id = $1 AND idempotency_key = $2`,
    [userId, idempotencyKey],
  );
  if (existing) {
    if (existing.videoId !== videoId) {
      throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "Khóa thử lại đang được dùng cho một nội dung khác.");
    }
    return existing;
  }
  const inspection = inspectAcquisition(videoId);
  const jobId = randomUUID();
  if (inspection.acquisitionState === "AVAILABLE" && fixture) {
    const bytes = await fixtureBytes(fixture);
    const assetId = await registerReadyAsset({
      userId,
      sourceType: "YOUTUBE",
      filename: `${fixture}.wav`,
      bytes,
      youtubeVideoId: null,
    });
    await query(
      `INSERT INTO youtube_import_jobs (
        id, owner_user_id, video_id, original_url, state, acquisition_state, title, asset_id, idempotency_key
      ) VALUES ($1,$2,$3,$4,'READY_FOR_EDITING','AVAILABLE',$5,$6,$7)`,
      [jobId, userId, videoId, raw, "Nguồn kiểm thử cục bộ", assetId, idempotencyKey],
    );
    return getImport(userId, jobId);
  }
  if (fixture || inspection.acquisitionState !== "AVAILABLE") {
    await query(
      `INSERT INTO youtube_import_jobs (
        id, owner_user_id, video_id, original_url, state, acquisition_state, error_code, idempotency_key
      ) VALUES ($1,$2,$3,$4,'FAILED',$5,$6,$7)`,
      [jobId, userId, videoId, raw, inspection.acquisitionState, inspection.reasonCode, idempotencyKey],
    );
    return getImport(userId, jobId);
  }
  const active = await one<{ id: string }>(
    `SELECT id FROM youtube_import_jobs
     WHERE owner_user_id = $1 AND video_id = $2 AND state IN ${ACTIVE_STATES}`,
    [userId, videoId],
  );
  if (active) return getImport(userId, active.id);
  const metadata = await lookupYouTubeMetadata(raw);
  const tooLong = metadata.durationMs !== null && metadata.durationMs > MAX_SOURCE_MS;
  await query(
    `INSERT INTO youtube_import_jobs (
      id, owner_user_id, video_id, original_url, state, acquisition_state, title, channel_name,
      thumbnail_url, duration_ms, error_code, idempotency_key
    ) VALUES ($1,$2,$3,$4,$5,'AVAILABLE',$6,$7,$8,$9,$10,$11)`,
    [
      jobId,
      userId,
      videoId,
      raw,
      tooLong ? "FAILED" : "DOWNLOADING",
      metadata.title,
      metadata.channelName,
      metadata.thumbnailUrl,
      metadata.durationMs,
      tooLong ? "DURATION_EXCEEDED" : null,
      idempotencyKey,
    ],
  );
  if (!tooLong) await downloadIntoLibrary(userId, jobId, videoId, metadata.title, acquire);
  return getImport(userId, jobId);
}

async function downloadIntoLibrary(
  userId: string,
  jobId: string,
  videoId: string,
  title: string | null,
  acquire: Acquirer,
): Promise<void> {
  const workDir = safePath(`temporary/youtube-${jobId}`);
  try {
    await mkdir(workDir, { recursive: true });
    const file = await acquire(videoId, workDir);
    await setJobState(jobId, "GENERATING_WAVEFORM");
    const assetId = await registerReadyAsset({
      userId,
      sourceType: "YOUTUBE",
      filename: libraryFilename(title ?? videoId, path.extname(file)),
      bytes: await readFile(file),
      youtubeVideoId: videoId,
    });
    await query(
      `UPDATE youtube_import_jobs SET state = 'READY_FOR_EDITING', asset_id = $2, error_code = NULL, updated_at = now()
       WHERE id = $1`,
      [jobId, assetId],
    );
  } catch (error) {
    const code = error instanceof AppError ? error.code : "DOWNLOAD_FAILED";
    console.error(`youtube-import ${jobId} failed ${code}`);
    await query(
      "UPDATE youtube_import_jobs SET state = 'FAILED', error_code = $2, updated_at = now() WHERE id = $1",
      [jobId, code],
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function setJobState(jobId: string, state: string): Promise<void> {
  await query("UPDATE youtube_import_jobs SET state = $2, updated_at = now() WHERE id = $1", [jobId, state]);
}

function libraryFilename(title: string, extension: string): string {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  return `${base || "youtube"}${extension || ".mp3"}`;
}

function parsedVideoId(raw: string): string {
  const parsed = parseYouTubeUrl(raw);
  if ("error" in parsed) throw new AppError(422, "MALFORMED_URL", "Liên kết YouTube không hợp lệ.");
  return parsed.videoId;
}

function checkedFixture(raw: string): string {
  const env = getEnv();
  if (!env.authTestMode || env.production) {
    throw new AppError(422, "FIXTURE_DISABLED", "Nguồn kiểm thử chỉ dùng được ở chế độ thử trên máy phát triển.");
  }
  if (!FIXTURE_NAME.test(raw.slice(FIXTURE_PREFIX.length))) {
    throw new AppError(422, "UNTRUSTED_FIXTURE", "Nguồn kiểm thử không hợp lệ.");
  }
  return raw;
}

async function fixtureBytes(fixture: string): Promise<Buffer> {
  const name = fixture.slice(FIXTURE_PREFIX.length);
  const file = path.join(process.cwd(), "tests/fixtures/media", `${name}.wav`);
  try {
    return await readFile(file);
  } catch {
    throw new AppError(404, "FIXTURE_NOT_FOUND", "Không thấy tệp nguồn kiểm thử.");
  }
}

export async function getImport(userId: string, jobId: string) {
  const job = await one(
    `SELECT id, state, acquisition_state AS "acquisitionState", error_code AS "errorCode", asset_id AS "assetId",
      title, channel_name AS "channelName", thumbnail_url AS "thumbnailUrl", duration_ms AS "durationMs",
      video_id AS "videoId", original_url AS "originalUrl"
     FROM youtube_import_jobs WHERE id = $1 AND owner_user_id = $2`,
    [jobId, userId],
  );
  if (!job) throw new AppError(404, "NOT_FOUND", "Không thấy lượt nhập.");
  return job;
}

export async function cancelImport(userId: string, jobId: string) {
  const job = await getImport(userId, jobId);
  if (job.state === "READY_FOR_EDITING" || job.state === "FAILED") {
    throw new AppError(409, "NOT_CANCELLABLE", "Lượt nhập đã kết thúc.");
  }
  await query("UPDATE youtube_import_jobs SET state = 'CANCELLED', updated_at = now() WHERE id = $1", [jobId]);
  return getImport(userId, jobId);
}
