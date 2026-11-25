import { addStage } from "@/server/plans";
import { planRoute } from "@/server/plans/route";
import { stageCreateBody } from "@/server/plans/schemas";

export const POST = planRoute(
  stageCreateBody,
  (userId, { planId }: { planId: string }, body) => addStage(userId, planId, body.name, body.version),
  201,
);
