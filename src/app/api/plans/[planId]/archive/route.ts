import { setArchive } from "@/server/plans";
import { planRoute } from "@/server/plans/route";
import { versionBody } from "@/server/plans/schemas";

export const POST = planRoute(versionBody, (userId, { planId }: { planId: string }, body) => setArchive(userId, planId, true, body.version));
