import { z } from "zod";

const version = z.number().int();
const id = z.string().uuid();
const optionalText = (max: number) => z.string().max(max).nullable().optional();

function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneField = z.string().min(1).max(64).refine(isTimeZone);

export const versionBody = z.object({ version });

export const stageCreateBody = z.object({ name: z.string().trim().min(1).max(160), version });

export const stageUpdateBody = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: optionalText(4000),
  approximateTime: optionalText(80),
  estimatedDurationMs: z.number().int().min(0).max(86_400_000).nullable().optional(),
  status: z.enum(["MUSIC_REQUIRED", "NO_MUSIC", "SKIPPED"]).optional(),
  version,
});

export const stageOrderBody = z.object({ stageIds: z.array(id).max(200), version });

export const cueCreateBody = z.object({
  revisionId: id,
  instruction: optionalText(2000),
  responsiblePerson: optionalText(120),
  advisoryTiming: optionalText(200),
  version,
});

export const cueUpdateBody = z.object({
  instruction: optionalText(2000),
  responsiblePerson: optionalText(120),
  advisoryTiming: optionalText(200),
  revisionId: id.optional(),
  listeningApproved: z.boolean().optional(),
  version,
});

export const cueOrderBody = z.object({ cueIds: z.array(id).max(500), version });

export const playlistSnapshotBody = z.object({ playlistId: id, version });

const stageRef = { stageId: id };
const cueRef = { cueId: id };

export const planActionBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("duplicate") }),
  versionBody.extend({ action: z.literal("archive") }),
  versionBody.extend({ action: z.literal("reopen") }),
  stageCreateBody.extend({ action: z.literal("add-stage") }),
  stageUpdateBody.extend({ action: z.literal("update-stage"), ...stageRef }),
  stageOrderBody.extend({ action: z.literal("reorder-stages") }),
  versionBody.extend({ action: z.literal("duplicate-stage"), ...stageRef }),
  versionBody.extend({ action: z.literal("remove-stage"), ...stageRef }),
  cueCreateBody.extend({ action: z.literal("add-cue"), ...stageRef }),
  playlistSnapshotBody.extend({ action: z.literal("snapshot"), ...stageRef }),
  playlistSnapshotBody.extend({ action: z.literal("refresh-playlist"), ...stageRef }),
  cueUpdateBody.extend({ action: z.literal("update-cue"), ...cueRef }),
  cueOrderBody.extend({ action: z.literal("reorder-cues"), ...stageRef }),
  versionBody.extend({ action: z.literal("remove-cue"), ...cueRef }),
]);
