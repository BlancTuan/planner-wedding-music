import { duplicateStage } from "@/server/plans";
import { planRoute } from "@/server/plans/route";
import { versionBody } from "@/server/plans/schemas";

export const POST = planRoute(
  versionBody,
  (userId, { planId, stageId }: { planId: string; stageId: string }, body) => duplicateStage(userId, planId, stageId, body.version),
  201,
);
