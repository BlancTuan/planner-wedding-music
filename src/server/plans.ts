import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { getPool, one, query } from "@/server/db";
import { AppError } from "@/server/errors";
import { versionsConflict } from "@/server/concurrency";
import { getPlaylist } from "@/server/playlists";
import { evaluateReadiness, type ReadinessCue, type ReadinessStage } from "@/server/readiness";
import { snapshotPlaylist } from "@/server/plans/snapshot";
import { removeStorage } from "@/server/storage";

export const SUGGESTED_STAGES = [
  "Đón khách",
  "Giới thiệu lễ",
  "Lối vào cô dâu",
  "Lối vào chú rể",
  "Nghi lễ gia tiên",
  "Trao nhẫn",
  "Cắt bánh",
  "Nâng ly",
  "Tiệc cưới",
  "Nhạc nền",
  "Tiễn khách",
];

export async function listPlans(userId: string) {
  return query(
    `SELECT id, name, to_char(wedding_date, 'YYYY-MM-DD') AS "weddingDate", location, time_zone AS "timeZone", state, version
     FROM wedding_plans WHERE owner_user_id = $1 ORDER BY updated_at DESC`,
    [userId],
  );
}

export async function createPlan(userId: string, input: { name: string; template: "EMPTY" | "VIETNAMESE_SUGGESTED"; timeZone?: string }) {
  const id = randomUUID();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO wedding_plans (id, owner_user_id, name, time_zone, state) VALUES ($1, $2, $3, $4, 'DRAFT')`,
      [id, userId, input.name.trim(), input.timeZone || "Asia/Ho_Chi_Minh"],
    );
    if (input.template === "VIETNAMESE_SUGGESTED") {
      for (let index = 0; index < SUGGESTED_STAGES.length; index += 1) {
        await client.query(
          `INSERT INTO wedding_stages (id, plan_id, name, status, position) VALUES ($1, $2, $3, 'MUSIC_REQUIRED', $4)`,
          [randomUUID(), id, SUGGESTED_STAGES[index], index],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return getPlan(userId, id);
}

type Runner = <T extends QueryResultRow>(text: string, values: unknown[]) => Promise<T[]>;

function runner(client?: PoolClient): Runner {
  return client ? async (text, values) => (await client.query(text, values)).rows : query;
}

export async function getPlan(userId: string, planId: string, client?: PoolClient) {
  const run = runner(client);
  const [plan] = await run<{
    id: string;
    name: string;
    weddingDate: string | null;
    location: string | null;
    timeZone: string;
    notes: string | null;
    state: string;
    version: number;
    listeningApprovedAt: string | null;
  }>(
    `SELECT id, name, to_char(wedding_date, 'YYYY-MM-DD') AS "weddingDate", location, time_zone AS "timeZone", notes, state, version,
      listening_approved_at AS "listeningApprovedAt"
     FROM wedding_plans WHERE id = $1 AND owner_user_id = $2`,
    [planId, userId],
  );
  if (!plan) throw new AppError(404, "NOT_FOUND", "Không thấy kế hoạch.");
  const stages = await run<{
    id: string;
    name: string;
    description: string | null;
    approximateTime: string | null;
    estimatedDurationMs: number | null;
    status: "MUSIC_REQUIRED" | "NO_MUSIC" | "SKIPPED";
    position: number;
    version: number;
  }>(
    `SELECT id, name, description, approximate_time AS "approximateTime", estimated_duration_ms AS "estimatedDurationMs",
      status, position, version
     FROM wedding_stages WHERE plan_id = $1 ORDER BY position`,
    [planId],
  );
  const cues = await run<{
    id: string;
    stageId: string;
    revisionId: string;
    instruction: string | null;
    responsiblePerson: string | null;
    advisoryTiming: string | null;
    position: number;
    listeningApprovedAt: string | null;
    playlistItemId: string | null;
    sourcePlaylistId: string | null;
    version: number;
    assetId: string;
    assetFilename: string | null;
    revisionName: string | null;
    trimStartMs: number;
    trimEndMs: number;
    exportId: string | null;
    exportState: string;
  }>(
    `SELECT c.id, c.stage_id AS "stageId", c.revision_id AS "revisionId", c.instruction,
      c.responsible_person AS "responsiblePerson", c.advisory_timing AS "advisoryTiming", c.position,
      c.listening_approved_at AS "listeningApprovedAt", c.playlist_item_id AS "playlistItemId",
      c.source_playlist_id AS "sourcePlaylistId", c.version,
      r.asset_id AS "assetId", a.original_filename AS "assetFilename", r.name AS "revisionName",
      r.trim_start_ms AS "trimStartMs", r.trim_end_ms AS "trimEndMs",
      e.id AS "exportId", coalesce(e.state, 'NONE') AS "exportState"
     FROM music_cues c
     JOIN wedding_stages s ON s.id = c.stage_id
     JOIN audio_revisions r ON r.id = c.revision_id
     JOIN audio_assets a ON a.id = r.asset_id
     LEFT JOIN LATERAL (
       SELECT id, state FROM export_artifacts WHERE revision_id = r.id ORDER BY created_at DESC LIMIT 1
     ) e ON true
     WHERE s.plan_id = $1 ORDER BY c.position`,
    [planId],
  );
  return {
    ...plan,
    stages: stages.map((stage) => ({ ...stage, cues: cues.filter((cue) => cue.stageId === stage.id) })),
  };
}

export async function updatePlan(userId: string, planId: string, input: {
  name?: string;
  weddingDate?: string | null;
  location?: string | null;
  timeZone?: string;
  notes?: string | null;
  version: number;
}) {
  const current = await getPlan(userId, planId);
  assertNotArchived(current.state);
  if (versionsConflict(current.version, input.version)) {
    throw new AppError(409, "CONFLICT", "Kế hoạch đã được sửa ở một phiên khác.", { version: current.version });
  }
  const updated = await query(
    `UPDATE wedding_plans SET name = $3, wedding_date = $4, location = $5, time_zone = $6, notes = $7,
      state = CASE WHEN state = 'READY' THEN 'NEEDS_REVIEW' ELSE state END,
      listening_approved_at = NULL, version = version + 1, updated_at = now()
     WHERE id = $1 AND owner_user_id = $2 AND version = $8 AND state <> 'ARCHIVED'
     RETURNING version`,
    [
      planId,
      userId,
      input.name ?? current.name,
      input.weddingDate === undefined ? current.weddingDate : input.weddingDate,
      input.location === undefined ? current.location : input.location,
      input.timeZone ?? current.timeZone,
      input.notes === undefined ? current.notes : input.notes,
      input.version,
    ],
  );
  if (!updated.length) throw new AppError(409, "CONFLICT", "Kế hoạch đã được sửa ở một phiên khác.", { version: current.version });
  await query("UPDATE handoff_packages SET is_outdated = true WHERE plan_id = $1", [planId]);
  return getPlan(userId, planId);
}

export async function duplicatePlanRecord(userId: string, planId: string) {
  const source = await getPlan(userId, planId);
  const id = randomUUID();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO wedding_plans (id, owner_user_id, name, wedding_date, location, time_zone, notes, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT')`,
      [id, userId, `${source.name} (bản sao)`.slice(0, 160), source.weddingDate, source.location, source.timeZone, source.notes],
    );
    for (const stage of source.stages) {
      const stageId = randomUUID();
      await client.query(
        `INSERT INTO wedding_stages (id, plan_id, name, description, approximate_time, estimated_duration_ms, status, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [stageId, id, stage.name, stage.description, stage.approximateTime, stage.estimatedDurationMs, stage.status, stage.position],
      );
      for (const cue of stage.cues) {
        await client.query(
          `INSERT INTO music_cues (id, stage_id, revision_id, instruction, responsible_person, advisory_timing, position, playlist_item_id, source_playlist_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [randomUUID(), stageId, cue.revisionId, cue.instruction, cue.responsiblePerson, cue.advisoryTiming, cue.position, cue.playlistItemId, cue.sourcePlaylistId],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return getPlan(userId, id);
}

export async function setArchive(userId: string, planId: string, archived: boolean, version: number) {
  const plan = await getPlan(userId, planId);
  if (versionsConflict(plan.version, version)) throw new AppError(409, "CONFLICT", "Kế hoạch đã được sửa ở một phiên khác.");
  const updated = await query(
    `UPDATE wedding_plans SET state = $3, version = version + 1, updated_at = now()
     WHERE id = $1 AND owner_user_id = $2 AND version = $4 RETURNING id`,
    [planId, userId, archived ? "ARCHIVED" : "DRAFT", version],
  );
  if (!updated.length) throw new AppError(409, "CONFLICT", "Kế hoạch đã được sửa ở một phiên khác.");
  return getPlan(userId, planId);
}

export async function deletePlan(userId: string, planId: string, confirm: boolean, version: number) {
  const plan = await getPlan(userId, planId);
  if (!confirm || versionsConflict(plan.version, version)) {
    throw new AppError(409, "CONFLICT", "Cần xác nhận đúng phiên bản trước khi xoá.");
  }
  const client = await getPool().connect();
  let keys: string[] = [];
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT id FROM wedding_plans WHERE id = $1 AND owner_user_id = $2 AND version = $3 FOR UPDATE`,
      [planId, userId, version],
    );
    if (!locked.rowCount) throw new AppError(409, "CONFLICT", "Cần xác nhận đúng phiên bản trước khi xoá.");
    const packages = await client.query<{ storageKey: string | null; bytes: string }>(
      `SELECT storage_key AS "storageKey", coalesce(byte_size, 0)::text AS bytes FROM handoff_packages WHERE plan_id = $1`,
      [planId],
    );
    keys = packages.rows.flatMap((row) => (row.storageKey ? [row.storageKey] : []));
    const refund = packages.rows.reduce((total, row) => total + Number(row.bytes), 0);
    await client.query("DELETE FROM wedding_plans WHERE id = $1", [planId]);
    await client.query(
      "UPDATE users SET storage_used_bytes = GREATEST(0, storage_used_bytes - $2) WHERE id = $1",
      [userId, refund],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await Promise.all(keys.map((key) => removeStorage(key).catch(() => undefined)));
}

export async function addStage(userId: string, planId: string, name: string, version: number) {
  const plan = await getPlan(userId, planId);
  await assertPlanVersion(plan.version, version);
  return changePlan(userId, planId, version, async (client) => {
    await client.query(
      `INSERT INTO wedding_stages (id, plan_id, name, status, position) VALUES ($1, $2, $3, 'MUSIC_REQUIRED', $4)`,
      [randomUUID(), planId, name.trim(), plan.stages.length],
    );
  });
}

export async function updateStage(userId: string, planId: string, stageId: string, input: {
  name?: string;
  description?: string | null;
  approximateTime?: string | null;
  estimatedDurationMs?: number | null;
  status?: "MUSIC_REQUIRED" | "NO_MUSIC" | "SKIPPED";
  version: number;
}) {
  const plan = await getPlan(userId, planId);
  await assertPlanVersion(plan.version, input.version);
  const stage = plan.stages.find((item) => item.id === stageId);
  if (!stage) throw new AppError(404, "NOT_FOUND", "Không thấy phần lễ.");
  return changePlan(userId, planId, input.version, async (client) => {
    await client.query(
      `UPDATE wedding_stages SET name = coalesce($2, name), description = $3, approximate_time = $4,
        estimated_duration_ms = $5, status = coalesce($6, status), version = version + 1
       WHERE id = $1`,
      [
        stageId,
        input.name ?? null,
        input.description === undefined ? stage.description : input.description,
        input.approximateTime === undefined ? stage.approximateTime : input.approximateTime,
        input.estimatedDurationMs === undefined ? stage.estimatedDurationMs : input.estimatedDurationMs,
        input.status ?? null,
      ],
    );
  });
}

export async function addCue(userId: string, planId: string, stageId: string, input: {
  revisionId: string;
  instruction?: string | null;
  responsiblePerson?: string | null;
  advisoryTiming?: string | null;
  version: number;
}) {
  const plan = await getPlan(userId, planId);
  await assertPlanVersion(plan.version, input.version);
  const stage = plan.stages.find((item) => item.id === stageId);
  if (!stage) throw new AppError(404, "NOT_FOUND", "Không thấy phần lễ.");
  const revision = await one("SELECT id FROM audio_revisions WHERE id = $1 AND owner_user_id = $2", [input.revisionId, userId]);
  if (!revision) throw new AppError(404, "NOT_FOUND", "Không thấy bản chỉnh.");
  return changePlan(userId, planId, input.version, async (client) => {
    await client.query(
      `INSERT INTO music_cues (id, stage_id, revision_id, instruction, responsible_person, advisory_timing, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), stageId, input.revisionId, input.instruction ?? null, input.responsiblePerson ?? null, input.advisoryTiming ?? null, stage.cues.length],
    );
  });
}

export async function snapshotStageFromPlaylist(userId: string, planId: string, stageId: string, playlistId: string, version: number, replace: boolean) {
  const plan = await getPlan(userId, planId);
  await assertPlanVersion(plan.version, version);
  const stage = plan.stages.find((item) => item.id === stageId);
  if (!stage) throw new AppError(404, "NOT_FOUND", "Không thấy phần lễ.");
  const playlist = await getPlaylist(userId, playlistId);
  const copied = snapshotPlaylist(
    playlist.items.map((item) => ({
      id: String(item.id),
      revisionId: String(item.revisionId),
      note: String(item.note ?? ""),
      position: Number(item.position),
    })),
  );
  const kept = replace ? stage.cues.filter((cue) => cue.sourcePlaylistId !== playlistId) : stage.cues;
  const added = copied.map((cue) => ({ ...cue, id: randomUUID() }));
  return changePlan(userId, planId, version, async (client) => {
    if (replace) {
      await client.query("DELETE FROM music_cues WHERE stage_id = $1 AND source_playlist_id = $2", [stageId, playlistId]);
    }
    for (const [index, cue] of added.entries()) {
      await client.query(
        `INSERT INTO music_cues (id, stage_id, revision_id, instruction, position, playlist_item_id, source_playlist_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [cue.id, stageId, cue.revisionId, cue.note || null, 2000000 + index, cue.playlistItemId, playlistId],
      );
    }
    await setCuePositions(client, stageId, [...kept.map((cue) => cue.id), ...added.map((cue) => cue.id)]);
  });
}

export async function updateCue(userId: string, planId: string, cueId: string, input: {
  instruction?: string | null;
  responsiblePerson?: string | null;
  advisoryTiming?: string | null;
  revisionId?: string;
  listeningApproved?: boolean;
  version: number;
}) {
  const plan = await getPlan(userId, planId);
  await assertPlanVersion(plan.version, input.version);
  const cue = plan.stages.flatMap((stage) => stage.cues).find((item) => item.id === cueId);
  if (!cue) throw new AppError(404, "NOT_FOUND", "Không thấy điểm nhạc.");
  if (input.revisionId) {
    const revision = await one("SELECT id FROM audio_revisions WHERE id = $1 AND owner_user_id = $2", [input.revisionId, userId]);
    if (!revision) throw new AppError(404, "NOT_FOUND", "Không thấy bản chỉnh.");
  }
  const replaced = input.revisionId !== undefined && input.revisionId !== cue.revisionId;
  const approval = replaced ? false : input.listeningApproved ?? null;
  return changePlan(userId, planId, input.version, async (client) => {
    await client.query(
      `UPDATE music_cues SET instruction = $2, responsible_person = $3, advisory_timing = $4,
        revision_id = coalesce($5, revision_id),
        listening_approved_at = CASE WHEN $6::boolean THEN now() WHEN $6::boolean = false THEN NULL ELSE listening_approved_at END,
        version = version + 1
       WHERE id = $1`,
      [
        cueId,
        input.instruction === undefined ? cue.instruction : input.instruction,
        input.responsiblePerson === undefined ? cue.responsiblePerson : input.responsiblePerson,
        input.advisoryTiming === undefined ? cue.advisoryTiming : input.advisoryTiming,
        input.revisionId ?? null,
        approval,
      ],
    );
  });
}

export async function readinessForPlan(userId: string, planId: string, client?: PoolClient) {
  const plan = await getPlan(userId, planId, client);
  const stages = await readinessStages(plan.stages, client);
  return { state: plan.state, version: plan.version, checks: evaluateReadiness(stages) };
}

export async function confirmReadiness(userId: string, planId: string, version: number) {
  const report = await readinessForPlan(userId, planId);
  assertNotArchived(report.state);
  if (versionsConflict(report.version, version)) throw new AppError(409, "CONFLICT", "Kế hoạch đã được sửa ở một phiên khác.");
  if (report.checks.length > 0) {
    throw new AppError(422, "NOT_READY", "Kế hoạch còn mục chưa đạt.", { checks: report.checks });
  }
  const confirmed = await query(
    `UPDATE wedding_plans SET state = 'READY', listening_approved_at = now(), version = version + 1, updated_at = now()
     WHERE id = $1 AND owner_user_id = $2 AND version = $3 RETURNING id`,
    [planId, userId, version],
  );
  if (!confirmed.length) throw new AppError(409, "CONFLICT", "Kế hoạch đã được sửa ở một phiên khác.");
  return getPlan(userId, planId);
}

async function readinessStages(stages: Awaited<ReturnType<typeof getPlan>>["stages"], client?: PoolClient): Promise<ReadinessStage[]> {
  const run = runner(client);
  const result: ReadinessStage[] = [];
  for (const stage of stages) {
    const cues = [];
    for (const cue of stage.cues) {
      const [row] = await run<{
        assetStatus: "READY" | "FAILED" | null;
        permission: "PREVIEW_ALLOWED" | "METADATA_ONLY" | "RESTRICTED" | null;
        exportState: string | null;
        durationMs: number | null;
        trimStartMs: number;
        trimEndMs: number;
      }>(
        `SELECT a.status AS "assetStatus", t.usage_permission AS permission, e.state AS "exportState",
          e.duration_ms AS "durationMs", r.trim_start_ms AS "trimStartMs", r.trim_end_ms AS "trimEndMs"
         FROM audio_revisions r
         JOIN audio_assets a ON a.id = r.asset_id
         LEFT JOIN catalog_tracks t ON t.audio_asset_id = a.id
         LEFT JOIN LATERAL (
           SELECT state, duration_ms FROM export_artifacts WHERE revision_id = r.id ORDER BY created_at DESC LIMIT 1
         ) e ON true
         WHERE r.id = $1`,
        [cue.revisionId],
      );
      const expected = row ? row.trimEndMs - row.trimStartMs : 0;
      const assetStatus: ReadinessCue["assetStatus"] =
        row?.assetStatus === "READY" || row?.assetStatus === "FAILED" ? row.assetStatus : "MISSING";
      cues.push({
        id: cue.id,
        revisionId: cue.revisionId,
        assetStatus,
        exportState: (row?.exportState ?? "NONE") as ReadinessStage["cues"][number]["exportState"],
        listeningApproved: Boolean(cue.listeningApprovedAt),
        permission: row?.permission ?? "PREVIEW_ALLOWED",
        durationDeltaMs: row?.durationMs == null ? null : row.durationMs - expected,
      });
    }
    result.push({ id: stage.id, name: stage.name, status: stage.status, cues });
  }
  return result;
}

async function changePlan(userId: string, planId: string, version: number, change: (client: PoolClient) => Promise<void>) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const bumped = await client.query(
      `UPDATE wedding_plans SET
         state = CASE WHEN state IN ('READY', 'NEEDS_REVIEW') THEN 'NEEDS_REVIEW' WHEN state = 'ARCHIVED' THEN 'ARCHIVED' ELSE 'DRAFT' END,
         listening_approved_at = NULL, version = version + 1, updated_at = now()
       WHERE id = $1 AND owner_user_id = $2 AND version = $3 RETURNING state`,
      [planId, userId, version],
    );
    if (!bumped.rowCount) throw new AppError(409, "CONFLICT", "Kế hoạch đã được sửa ở một phiên khác.");
    if (bumped.rows[0].state === "ARCHIVED") {
      throw new AppError(409, "PLAN_ARCHIVED", "Kế hoạch đang được lưu trữ. Hãy mở lại trước khi sửa.");
    }
    await change(client);
    await client.query("UPDATE handoff_packages SET is_outdated = true WHERE plan_id = $1 AND plan_version <> $2", [
      planId,
      version + 1,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return getPlan(userId, planId);
}

async function setStagePositions(client: PoolClient, planId: string, ids: string[]) {
  await client.query("UPDATE wedding_stages SET position = position + 1000000 WHERE plan_id = $1", [planId]);
  await client.query(
    `UPDATE wedding_stages s SET position = o.ord - 1, version = s.version + 1
     FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord) WHERE s.id = o.id AND s.plan_id = $1`,
    [planId, ids],
  );
}

async function setCuePositions(client: PoolClient, stageId: string, ids: string[]) {
  await client.query("UPDATE music_cues SET position = position + 1000000 WHERE stage_id = $1", [stageId]);
  await client.query(
    `UPDATE music_cues c SET position = o.ord - 1, version = c.version + 1
     FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord) WHERE c.id = o.id AND c.stage_id = $1`,
    [stageId, ids],
  );
}

function assertSameIds(current: string[], submitted: string[]) {
  const known = new Set(current);
  const unique = new Set(submitted);
  if (submitted.length !== current.length || unique.size !== submitted.length || submitted.some((id) => !known.has(id))) {
    throw new AppError(422, "INVALID_ORDER", "Thứ tự gửi lên phải gồm đủ và không lặp các mục hiện có.");
  }
}

export async function reorderStages(userId: string, planId: string, stageIds: string[], version: number) {
  const plan = await getPlan(userId, planId);
  await assertPlanVersion(plan.version, version);
  assertSameIds(plan.stages.map((stage) => stage.id), stageIds);
  return changePlan(userId, planId, version, (client) => setStagePositions(client, planId, stageIds));
}

export async function duplicateStage(userId: string, planId: string, stageId: string, version: number) {
  const plan = await getPlan(userId, planId);
  await assertPlanVersion(plan.version, version);
  const index = plan.stages.findIndex((stage) => stage.id === stageId);
  if (index < 0) throw new AppError(404, "NOT_FOUND", "Không thấy phần lễ.");
  const source = plan.stages[index];
  const copyId = randomUUID();
  const order = plan.stages.map((stage) => stage.id);
  order.splice(index + 1, 0, copyId);
  return changePlan(userId, planId, version, async (client) => {
    await client.query(
      `INSERT INTO wedding_stages (id, plan_id, name, description, approximate_time, estimated_duration_ms, status, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        copyId,
        planId,
        `${source.name} (bản sao)`.slice(0, 160),
        source.description,
        source.approximateTime,
        source.estimatedDurationMs,
        source.status,
        2000000 + plan.stages.length,
      ],
    );
    await client.query(
      `INSERT INTO music_cues (id, stage_id, revision_id, instruction, responsible_person, advisory_timing, position,
         playlist_item_id, source_playlist_id)
       SELECT gen_random_uuid(), $2, revision_id, instruction, responsible_person, advisory_timing, position,
         playlist_item_id, source_playlist_id
       FROM music_cues WHERE stage_id = $1`,
      [stageId, copyId],
    );
    await setStagePositions(client, planId, order);
  });
}

export async function removeStage(userId: string, planId: string, stageId: string, version: number) {
  const plan = await getPlan(userId, planId);
  await assertPlanVersion(plan.version, version);
  if (!plan.stages.some((stage) => stage.id === stageId)) throw new AppError(404, "NOT_FOUND", "Không thấy phần lễ.");
  const remaining = plan.stages.map((stage) => stage.id).filter((id) => id !== stageId);
  return changePlan(userId, planId, version, async (client) => {
    await client.query("DELETE FROM wedding_stages WHERE id = $1 AND plan_id = $2", [stageId, planId]);
    await setStagePositions(client, planId, remaining);
  });
}

export async function reorderCues(userId: string, planId: string, stageId: string, cueIds: string[], version: number) {
  const plan = await getPlan(userId, planId);
  await assertPlanVersion(plan.version, version);
  const stage = plan.stages.find((item) => item.id === stageId);
  if (!stage) throw new AppError(404, "NOT_FOUND", "Không thấy phần lễ.");
  assertSameIds(stage.cues.map((cue) => cue.id), cueIds);
  return changePlan(userId, planId, version, (client) => setCuePositions(client, stageId, cueIds));
}

export async function removeCue(userId: string, planId: string, cueId: string, version: number) {
  const plan = await getPlan(userId, planId);
  await assertPlanVersion(plan.version, version);
  const stage = plan.stages.find((item) => item.cues.some((cue) => cue.id === cueId));
  if (!stage) throw new AppError(404, "NOT_FOUND", "Không thấy điểm nhạc.");
  const remaining = stage.cues.map((cue) => cue.id).filter((id) => id !== cueId);
  return changePlan(userId, planId, version, async (client) => {
    await client.query("DELETE FROM music_cues WHERE id = $1 AND stage_id = $2", [cueId, stage.id]);
    await setCuePositions(client, stage.id, remaining);
  });
}

function assertNotArchived(state: string) {
  if (state === "ARCHIVED") throw new AppError(409, "PLAN_ARCHIVED", "Kế hoạch đang được lưu trữ. Hãy mở lại trước khi sửa.");
}

async function assertPlanVersion(current: number, submitted: number) {
  if (versionsConflict(current, submitted)) {
    throw new AppError(409, "CONFLICT", "Kế hoạch đã được sửa ở một phiên khác.", { version: current });
  }
}
