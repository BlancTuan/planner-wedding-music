import { reorderStages } from "@/server/plans";
import { planRoute } from "@/server/plans/route";
import { stageOrderBody } from "@/server/plans/schemas";

export const PUT = planRoute(stageOrderBody, (userId, { planId }: { planId: string }, body) =>
  reorderStages(userId, planId, body.stageIds, body.version),
);
