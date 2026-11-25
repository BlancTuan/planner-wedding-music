import { removeStage, updateStage } from "@/server/plans";
import { planRoute } from "@/server/plans/route";
import { stageUpdateBody, versionBody } from "@/server/plans/schemas";

type Params = { planId: string; stageId: string };

export const PATCH = planRoute(stageUpdateBody, (userId, { planId, stageId }: Params, body) => updateStage(userId, planId, stageId, body));

export const DELETE = planRoute(versionBody, (userId, { planId, stageId }: Params, body) => removeStage(userId, planId, stageId, body.version));
