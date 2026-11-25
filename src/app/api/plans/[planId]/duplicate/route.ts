import { duplicatePlanRecord } from "@/server/plans";
import { planRoute } from "@/server/plans/route";

export const POST = planRoute<{ planId: string }, undefined>(null, (userId, { planId }) => duplicatePlanRecord(userId, planId), 201);
