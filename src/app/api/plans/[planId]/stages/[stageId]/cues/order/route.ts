import { reorderCues } from "@/server/plans";
import { planRoute } from "@/server/plans/route";
import { cueOrderBody } from "@/server/plans/schemas";

export const PUT = planRoute(cueOrderBody, (userId, { planId, stageId }: { planId: string; stageId: string }, body) =>
  reorderCues(userId, planId, stageId, body.cueIds, body.version),
);
