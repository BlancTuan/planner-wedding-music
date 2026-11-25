import { removeCue, updateCue } from "@/server/plans";
import { planRoute } from "@/server/plans/route";
import { cueUpdateBody, versionBody } from "@/server/plans/schemas";

type Params = { planId: string; cueId: string };

export const PATCH = planRoute(cueUpdateBody, (userId, { planId, cueId }: Params, body) => updateCue(userId, planId, cueId, body));

export const DELETE = planRoute(versionBody, (userId, { planId, cueId }: Params, body) => removeCue(userId, planId, cueId, body.version));
