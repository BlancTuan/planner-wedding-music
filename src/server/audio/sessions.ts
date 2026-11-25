import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fullSongEdits, validateEdits, type AudioEdits } from "@/server/audio/edits";
import { inspectImportSource } from "@/server/audio/import-policy";
import { convertToEditorMp3, renderEditsMp3 } from "@/server/audio/render";
import type { ExportView, SessionView } from "@/server/audio/session-view";
import { one, query } from "@/server/db";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { buildWaveformPeaks } from "@/server/media/waveform";
import { readStorage, removeStorage, removeTemporarySessionDir, safePath, writeStorage } from "@/server/storage";
import { lookupYouTubeMetadata } from "@/server/youtube/metadata";
import { parseYouTubeUrl } from "@/server/youtube/url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIXTURE_NAME = /^[a-z0-9-]{1,40}$/;
const MAX_BYTES = 104_857_600;

const jobs = new Map<string, AbortController>();

type SessionRow = {
  id: string;
  state: string;
  sourceKind: string;
  title: string | null;
  channelName: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  errorCode: string | null;
  durationMs: number | null;
  audioKey: string | null;
  waveformKey: string | null;
  edits: unknown;
  createdAt: Date | string;
  lastActivityAt: Date | string;
  expiresAt: Date | string;
  expired: boolean;
};

const SESSION_COLUMNS = `id::text, state, source_kind AS "sourceKind", title,
  channel_name AS "channelName", thumbnail_url AS "thumbnailUrl", source_url AS "sourceUrl",
  error_code AS "errorCode", duration_ms AS "durationMs", audio_key AS "audioKey",
  waveform_key AS "waveformKey", edits, created_at AS "createdAt",
  last_activity_at AS "lastActivityAt", expires_at AS "expiresAt", (expires_at <= now()) AS expired`;

function assertId(id: string): void {
  if (!UUID.test(id)) throw new AppError(404, "NOT_FOUND", "Không thấy phiên sửa.");
}

function ttlSeconds(): number {
  return getEnv().audioSessionTtlMs / 1000;
}

function emptyEdits(): AudioEdits {
  return { segments: [], fadeInMs: 0, fadeOutMs: 0, gainDb: 0 };
}

function parseEdits(value: unknown): AudioEdits {
  const body = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!body || typeof body !== "object" || !Array.isArray((body as { segments?: unknown }).segments)) return emptyEdits();
  const record = body as { segments: Array<{ startMs?: unknown; endMs?: unknown }>; fadeInMs?: unknown; fadeOutMs?: unknown; gainDb?: unknown };
  return {
    segments: record.segments.map((segment) => ({
      startMs: Number(segment.startMs),
      endMs: Number(segment.endMs),
    })),
    fadeInMs: Number(record.fadeInMs ?? 0),
    fadeOutMs: Number(record.fadeOutMs ?? 0),
    gainDb: Number(record.gainDb ?? 0),
  };
}

function view(row: SessionRow): SessionView {
  return {
    id: row.id,
    state: row.state,
    sourceKind: row.sourceKind,
    title: row.title,
    channelName: row.channelName,
    thumbnailUrl: row.thumbnailUrl,
    sourceUrl: row.sourceUrl,
    durationMs: row.durationMs,
    errorCode: row.errorCode,
    edits: parseEdits(row.edits),
    createdAt: new Date(row.createdAt).toISOString(),
    lastActivityAt: new Date(row.lastActivityAt).toISOString(),
    expiresAt: new Date(row.expiresAt).toISOString(),
  };
}

async function owned(userId: string, sessionId: string): Promise<SessionRow> {
  assertId(sessionId);
  const row = await one<SessionRow>(
    `SELECT ${SESSION_COLUMNS} FROM audio_edit_sessions WHERE id = $1 AND owner_user_id = $2`,
    [sessionId, userId],
  );
  if (!row) throw new AppError(404, "NOT_FOUND", "Không thấy phiên sửa.");
  return row;
}

async function present(userId: string, sessionId: string): Promise<SessionView> {
  return view(await owned(userId, sessionId));
}

async function expireNow(sessionId: string): Promise<void> {
  jobs.get(sessionId)?.abort();
  jobs.delete(sessionId);
  await query("UPDATE audio_edit_sessions SET state = 'EXPIRED' WHERE id = $1 AND state <> 'EXPIRED'", [sessionId]);
  await removeTemporarySessionDir(sessionId);
}

async function requireLive(userId: string, sessionId: string): Promise<SessionRow> {
  const row = await owned(userId, sessionId);
  if (row.expired || row.state === "EXPIRED") {
    await expireNow(row.id);
    throw new AppError(410, "SESSION_EXPIRED", "Phiên sửa đã hết hạn. File tạm đã được xoá.");
  }
  return row;
}

async function touch(sessionId: string, force: boolean): Promise<void> {
  const seconds = ttlSeconds();
  const throttle = force ? "" : "AND last_activity_at <= now() - interval '15 seconds'";
  await query(
    `UPDATE audio_edit_sessions
     SET last_activity_at = now(), expires_at = now() + make_interval(secs => $2::double precision)
     WHERE id = $1 AND state <> 'EXPIRED' AND expires_at > now() ${throttle}`,
    [sessionId, seconds],
  );
}

async function setState(sessionId: string, state: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE audio_edit_sessions SET state = $2
     WHERE id = $1 AND state <> 'EXPIRED' AND expires_at > now()
     RETURNING id::text`,
    [sessionId, state],
  );
  return rows.length > 0;
}

async function markFailed(sessionId: string, code: string): Promise<void> {
  await query(
    `UPDATE audio_edit_sessions
     SET state = 'FAILED', error_code = $2, audio_key = NULL, waveform_key = NULL
     WHERE id = $1 AND state <> 'EXPIRED'`,
    [sessionId, code],
  );
}

async function removePartial(sessionId: string): Promise<void> {
  await removeStorage(`temporary-audio/${sessionId}/inbound.bin`).catch(() => undefined);
  await removeStorage(`temporary-audio/${sessionId}/original.mp3`).catch(() => undefined);
  await removeStorage(`temporary-audio/${sessionId}/waveform.json`).catch(() => undefined);
  await removeStorage(`temporary-audio/${sessionId}/edits.json`).catch(() => undefined);
}

function rejectBusy(state: string): void {
  if (state === "READY" || state === "EXPORTING") {
    throw new AppError(409, "ALREADY_READY", "Phiên này đã có audio.");
  }
  if (state === "IMPORTING_AUDIO" || state === "CONVERTING_AUDIO" || state === "GENERATING_WAVEFORM" || state === "FETCHING_METADATA") {
    throw new AppError(409, "IMPORT_IN_PROGRESS", "Đang nhập audio.");
  }
}

export async function sweepExpiredSessions(): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE audio_edit_sessions SET state = 'EXPIRED'
     WHERE expires_at <= now() AND state <> 'EXPIRED'
     RETURNING id::text AS id`,
  );
  for (const row of rows) {
    jobs.get(row.id)?.abort();
    jobs.delete(row.id);
    await removeTemporarySessionDir(row.id);
  }
  await removeOrphanedSessionDirs(new Set(rows.map((row) => row.id)));
  return rows.length;
}

async function removeOrphanedSessionDirs(alreadyRemoved: Set<string>): Promise<void> {
  let names: string[] = [];
  try {
    names = await readdir(safePath("temporary-audio"));
  } catch {
    return;
  }
  const live = await query<{ id: string }>(
    "SELECT id::text AS id FROM audio_edit_sessions WHERE state <> 'EXPIRED' AND expires_at > now()",
  );
  const liveIds = new Set(live.map((row) => row.id));
  for (const name of names) {
    if (!UUID.test(name) || liveIds.has(name) || jobs.has(name) || alreadyRemoved.has(name)) continue;
    await removeTemporarySessionDir(name);
  }
}

export async function createAudioSession(userId: string, url: string | null): Promise<SessionView> {
  await sweepExpiredSessions();
  const id = randomUUID();
  const seconds = ttlSeconds();
  if (!url) {
    await query(
      `INSERT INTO audio_edit_sessions (id, owner_user_id, state, source_kind, expires_at)
       VALUES ($1, $2, 'CREATED', 'NONE', now() + make_interval(secs => $3::double precision))`,
      [id, userId, seconds],
    );
    return present(userId, id);
  }
  const parsed = parseYouTubeUrl(url);
  if ("error" in parsed) throw new AppError(422, "MALFORMED_URL", "Liên kết YouTube không hợp lệ.");
  await query(
    `INSERT INTO audio_edit_sessions (id, owner_user_id, state, source_kind, source_url, video_id, expires_at)
     VALUES ($1, $2, 'FETCHING_METADATA', 'YOUTUBE', $3, $4, now() + make_interval(secs => $5::double precision))`,
    [id, userId, url, parsed.videoId, seconds],
  );
  try {
    const meta = await lookupYouTubeMetadata(url);
    await query(
      `UPDATE audio_edit_sessions
       SET state = 'CREATED', title = $2, channel_name = $3, thumbnail_url = $4,
           duration_ms = $5, error_code = NULL
       WHERE id = $1 AND state = 'FETCHING_METADATA'`,
      [id, meta.title, meta.channelName, meta.thumbnailUrl, meta.durationMs && meta.durationMs > 0 ? meta.durationMs : null],
    );
  } catch (error) {
    const code = error instanceof AppError ? error.code : "METADATA_FAILED";
    await query(
      "UPDATE audio_edit_sessions SET state = 'FAILED', error_code = $2 WHERE id = $1 AND state <> 'EXPIRED'",
      [id, code],
    );
  }
  return present(userId, id);
}

async function ingest(
  userId: string,
  sessionId: string,
  bytes: Buffer,
  kind: "UPLOAD" | "FIXTURE",
): Promise<SessionView> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    await markFailed(sessionId, bytes.byteLength === 0 ? "INVALID_AUDIO" : "FILE_TOO_LARGE");
    return present(userId, sessionId);
  }
  const controller = new AbortController();
  jobs.set(sessionId, controller);
  const inbound = `temporary-audio/${sessionId}/inbound.bin`;
  const audioKey = `temporary-audio/${sessionId}/original.mp3`;
  const waveKey = `temporary-audio/${sessionId}/waveform.json`;
  const editsKey = `temporary-audio/${sessionId}/edits.json`;
  try {
    if (!(await setState(sessionId, "IMPORTING_AUDIO"))) {
      await expireNow(sessionId);
      return present(userId, sessionId);
    }
    await writeStorage(inbound, bytes);
    if (!(await setState(sessionId, "CONVERTING_AUDIO"))) {
      await expireNow(sessionId);
      return present(userId, sessionId);
    }
    const converted = await convertToEditorMp3(safePath(inbound), safePath(audioKey), controller.signal);
    await removeStorage(inbound);
    if (!(await setState(sessionId, "GENERATING_WAVEFORM"))) {
      await expireNow(sessionId);
      return present(userId, sessionId);
    }
    const peaks = await buildWaveformPeaks(safePath(audioKey), 200);
    if (peaks.length === 0 || peaks.every((peak) => peak === 0)) {
      throw new AppError(422, "WAVEFORM_FAILED", "Không tạo được dạng sóng từ audio.");
    }
    const edits = fullSongEdits(converted.durationMs);
    if (validateEdits(edits, converted.durationMs)) {
      throw new AppError(422, "DURATION_TOO_SHORT", "Bản nhạc ngắn hơn một giây.");
    }
    await writeStorage(waveKey, Buffer.from(JSON.stringify({ durationMs: converted.durationMs, peaks })));
    await writeStorage(editsKey, Buffer.from(JSON.stringify(edits)));
    const updated = await query<{ id: string }>(
      `UPDATE audio_edit_sessions
       SET state = 'READY', source_kind = $2, duration_ms = $3, audio_key = $4, waveform_key = $5,
           edits = $6::jsonb, error_code = NULL, last_activity_at = now(),
           expires_at = now() + make_interval(secs => $7::double precision)
       WHERE id = $1 AND state <> 'EXPIRED' AND expires_at > now()
       RETURNING id::text`,
      [sessionId, kind, converted.durationMs, audioKey, waveKey, JSON.stringify(edits), ttlSeconds()],
    );
    if (updated.length === 0) await removeTemporarySessionDir(sessionId);
    return present(userId, sessionId);
  } catch (error) {
    if (controller.signal.aborted) return present(userId, sessionId);
    const code = error instanceof AppError ? error.code : "PROCESSING_FAILED";
    console.error(`audio-session ${sessionId} failed ${code}`);
    await removePartial(sessionId);
    await markFailed(sessionId, code);
    return present(userId, sessionId);
  } finally {
    if (jobs.get(sessionId) === controller) jobs.delete(sessionId);
  }
}

export async function importSessionUpload(
  userId: string,
  sessionId: string,
  bytes: Buffer,
): Promise<SessionView> {
  const row = await requireLive(userId, sessionId);
  rejectBusy(row.state);
  const policy = inspectImportSource({ kind: "upload" });
  if (policy.state !== "AVAILABLE") {
    await markFailed(sessionId, policy.reasonCode);
    return present(userId, sessionId);
  }
  return ingest(userId, sessionId, bytes, "UPLOAD");
}

export async function importSessionFixture(userId: string, sessionId: string, raw: string): Promise<SessionView> {
  const row = await requireLive(userId, sessionId);
  rejectBusy(row.state);
  const policy = inspectImportSource({ kind: "fixture" });
  if (policy.state !== "AVAILABLE") {
    await markFailed(sessionId, policy.reasonCode);
    return present(userId, sessionId);
  }
  const name = raw.startsWith("fixture:") ? raw.slice("fixture:".length) : "";
  if (!FIXTURE_NAME.test(name)) throw new AppError(422, "FIXTURE_DISABLED", "Nguồn kiểm thử không hợp lệ.");
  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(process.cwd(), "tests/fixtures/media", `${name}.wav`));
  } catch {
    throw new AppError(404, "NOT_FOUND", "Không thấy file kiểm thử.");
  }
  return ingest(userId, sessionId, bytes, "FIXTURE");
}

export async function readAudioSession(userId: string, sessionId: string): Promise<SessionView> {
  const row = await requireLive(userId, sessionId);
  await touch(row.id, false);
  return present(userId, sessionId);
}

export async function readSessionWaveform(
  userId: string,
  sessionId: string,
): Promise<{ durationMs: number; peaks: number[] }> {
  const row = await requireLive(userId, sessionId);
  if ((row.state !== "READY" && row.state !== "EXPORTING") || !row.waveformKey || row.durationMs === null) {
    throw new AppError(409, "NOT_READY", "Audio chưa sẵn sàng.");
  }
  await touch(sessionId, false);
  const parsed = JSON.parse((await readStorage(row.waveformKey)).toString("utf8")) as { peaks?: unknown };
  if (!Array.isArray(parsed.peaks) || parsed.peaks.some((peak) => typeof peak !== "number" || !Number.isFinite(peak))) {
    throw new AppError(409, "NOT_READY", "Dạng sóng chưa sẵn sàng.");
  }
  return { durationMs: row.durationMs, peaks: parsed.peaks as number[] };
}

export async function readSessionAudio(userId: string, sessionId: string): Promise<Buffer> {
  const row = await requireLive(userId, sessionId);
  if ((row.state !== "READY" && row.state !== "EXPORTING") || !row.audioKey) {
    throw new AppError(409, "NOT_READY", "Audio chưa sẵn sàng.");
  }
  await touch(sessionId, false);
  return readStorage(row.audioKey);
}

export async function saveSessionEdits(userId: string, sessionId: string, edits: AudioEdits): Promise<SessionView> {
  const row = await requireLive(userId, sessionId);
  if (row.state !== "READY" || row.durationMs === null) throw new AppError(409, "NOT_READY", "Audio chưa sẵn sàng.");
  const problem = validateEdits(edits, row.durationMs);
  if (problem) throw new AppError(422, problem, "Thao tác sửa không hợp lệ.");
  const saved = await query<{ id: string }>(
    `UPDATE audio_edit_sessions
     SET edits = $2::jsonb, last_activity_at = now(),
         expires_at = now() + make_interval(secs => $3::double precision)
     WHERE id = $1 AND state = 'READY' AND expires_at > now()
     RETURNING id::text`,
    [sessionId, JSON.stringify(edits), ttlSeconds()],
  );
  if (saved.length === 0) throw new AppError(410, "SESSION_EXPIRED", "Phiên sửa đã hết hạn. File tạm đã được xoá.");
  await writeStorage(`temporary-audio/${sessionId}/edits.json`, Buffer.from(JSON.stringify(edits)));
  return present(userId, sessionId);
}

export async function exportSessionAudio(userId: string, sessionId: string): Promise<ExportView> {
  const row = await requireLive(userId, sessionId);
  if (row.state !== "READY" || !row.audioKey || row.durationMs === null) {
    throw new AppError(409, "NOT_READY", "Audio chưa sẵn sàng.");
  }
  const edits = parseEdits(row.edits);
  const problem = validateEdits(edits, row.durationMs);
  if (problem) throw new AppError(422, problem, "Thao tác sửa không hợp lệ.");
  const controller = new AbortController();
  jobs.set(sessionId, controller);
  const exportId = randomUUID();
  const storageKey = `temporary-audio/${sessionId}/exports/${exportId}.mp3`;
  try {
    const started = await query<{ id: string }>(
      `UPDATE audio_edit_sessions
       SET state = 'EXPORTING', last_activity_at = now(),
           expires_at = now() + make_interval(secs => $2::double precision)
       WHERE id = $1 AND state = 'READY' AND expires_at > now()
       RETURNING id::text`,
      [sessionId, ttlSeconds()],
    );
    if (started.length === 0) throw new AppError(409, "NOT_READY", "Audio chưa sẵn sàng.");
    await query(
      "INSERT INTO audio_session_exports (id, session_id, state, storage_key) VALUES ($1, $2, 'EXPORTING', $3)",
      [exportId, sessionId, storageKey],
    );
    const rendered = await renderEditsMp3({
      sourcePath: safePath(row.audioKey),
      outputPath: safePath(storageKey),
      edits,
      signal: controller.signal,
    });
    await query(
      "UPDATE audio_session_exports SET state = 'COMPLETED', duration_ms = $2, error_code = NULL WHERE id = $1",
      [exportId, rendered.durationMs],
    );
    await query("UPDATE audio_edit_sessions SET state = 'READY' WHERE id = $1 AND state = 'EXPORTING'", [sessionId]);
    return { id: exportId, state: "COMPLETED", durationMs: rendered.durationMs, errorCode: null };
  } catch (error) {
    const code = error instanceof AppError ? error.code : "RENDER_FAILED";
    console.error(`audio-session ${sessionId} export failed ${code}`);
    await removeStorage(storageKey).catch(() => undefined);
    await query(
      "UPDATE audio_session_exports SET state = 'FAILED', error_code = $2, storage_key = NULL WHERE id = $1",
      [exportId, code],
    ).catch(() => undefined);
    await query(
      "UPDATE audio_edit_sessions SET state = 'READY' WHERE id = $1 AND state = 'EXPORTING' AND expires_at > now()",
      [sessionId],
    );
    if (controller.signal.aborted) {
      throw new AppError(410, "SESSION_EXPIRED", "Phiên sửa đã hết hạn. File tạm đã được xoá.");
    }
    if (error instanceof AppError) throw error;
    throw new AppError(422, "RENDER_FAILED", "Không xuất được file MP3.");
  } finally {
    if (jobs.get(sessionId) === controller) jobs.delete(sessionId);
  }
}

export async function readSessionExport(userId: string, sessionId: string, exportId: string): Promise<Buffer> {
  assertId(exportId);
  await requireLive(userId, sessionId);
  const file = await one<{ storageKey: string | null; state: string }>(
    `SELECT storage_key AS "storageKey", state FROM audio_session_exports WHERE id = $1 AND session_id = $2`,
    [exportId, sessionId],
  );
  if (!file || file.state !== "COMPLETED" || !file.storageKey) {
    throw new AppError(404, "NOT_FOUND", "Không thấy file xuất.");
  }
  await touch(sessionId, false);
  return readStorage(file.storageKey);
}

export async function deleteAudioSession(userId: string, sessionId: string): Promise<SessionView> {
  const row = await owned(userId, sessionId);
  await expireNow(row.id);
  return view({ ...row, state: "EXPIRED", expired: true, audioKey: null, waveformKey: null });
}
