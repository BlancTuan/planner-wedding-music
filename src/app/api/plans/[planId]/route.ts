import { z } from "zod";
import { requireUser } from "@/server/auth";
import { errorResponse, json, parseBody, readJson } from "@/server/http";
import {
  addCue,
  addStage,
  deletePlan,
  duplicatePlanRecord,
  duplicateStage,
  getPlan,
  removeCue,
  removeStage,
  reorderCues,
  reorderStages,
  setArchive,
  snapshotStageFromPlaylist,
  updateCue,
  updatePlan,
  updateStage,
} from "@/server/plans";
import { planActionBody, timeZoneField } from "@/server/plans/schemas";

export async function GET(request: Request, context: { params: Promise<{ planId: string }> }) {
  try {
    const user = await requireUser(request);
    const { planId } = await context.params;
    return json(await getPlan(user.id, planId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ planId: string }> }) {
  try {
    const user = await requireUser(request);
    const { planId } = await context.params;
    const body = parseBody(
      z.object({
        name: z.string().trim().min(1).max(160).optional(),
        weddingDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .refine((value) => {
            const parsed = new Date(`${value}T00:00:00Z`);
            return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
          })
          .nullable()
          .optional(),
        location: z.string().max(240).nullable().optional(),
        timeZone: timeZoneField.optional(),
        notes: z.string().max(8000).nullable().optional(),
        version: z.number().int(),
      }),
      await readJson(request),
    );
    return json(await updatePlan(user.id, planId, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ planId: string }> }) {
  try {
    const user = await requireUser(request);
    const { planId } = await context.params;
    const body = parseBody(z.object({ confirm: z.literal(true), version: z.number().int() }), await readJson(request));
    await deletePlan(user.id, planId, body.confirm, body.version);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ planId: string }> }) {
  try {
    const user = await requireUser(request);
    const { planId } = await context.params;
    const body = parseBody(planActionBody, await readJson(request));
    switch (body.action) {
      case "duplicate":
        return json(await duplicatePlanRecord(user.id, planId), 201);
      case "archive":
      case "reopen":
        return json(await setArchive(user.id, planId, body.action === "archive", body.version));
      case "add-stage":
        return json(await addStage(user.id, planId, body.name, body.version), 201);
      case "update-stage": {
        const { action: _action, stageId, ...input } = body;
        return json(await updateStage(user.id, planId, stageId, input));
      }
      case "reorder-stages":
        return json(await reorderStages(user.id, planId, body.stageIds, body.version));
      case "duplicate-stage":
        return json(await duplicateStage(user.id, planId, body.stageId, body.version), 201);
      case "remove-stage":
        return json(await removeStage(user.id, planId, body.stageId, body.version));
      case "add-cue": {
        const { action: _action, stageId, ...input } = body;
        return json(await addCue(user.id, planId, stageId, input), 201);
      }
      case "snapshot":
      case "refresh-playlist":
        return json(
          await snapshotStageFromPlaylist(user.id, planId, body.stageId, body.playlistId, body.version, body.action === "refresh-playlist"),
        );
      case "update-cue": {
        const { action: _action, cueId, ...input } = body;
        return json(await updateCue(user.id, planId, cueId, input));
      }
      case "reorder-cues":
        return json(await reorderCues(user.id, planId, body.stageId, body.cueIds, body.version));
      case "remove-cue":
        return json(await removeCue(user.id, planId, body.cueId, body.version));
    }
  } catch (error) {
    return errorResponse(error);
  }
}
