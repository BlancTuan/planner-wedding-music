import { addCue } from "@/server/plans";
import { planRoute } from "@/server/plans/route";
import { cueCreateBody } from "@/server/plans/schemas";

export const POST = planRoute(
  cueCreateBody,
  (userId, { planId, stageId }: { planId: string; stageId: string }, body) => addCue(userId, planId, stageId, body),
  201,
);
