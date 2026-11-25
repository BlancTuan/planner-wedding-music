import { requireUser } from "@/server/auth";
import { errorResponse, json } from "@/server/http";
import { buildHandoff, listPackages } from "@/server/handoff";

export async function POST(request: Request, context: { params: Promise<{ planId: string }> }) {
  try {
    const user = await requireUser(request);
    const { planId } = await context.params;
    const { storageKey: _storageKey, ...item } = await buildHandoff(user.id, planId);
    return json(item, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request, context: { params: Promise<{ planId: string }> }) {
  try {
    const user = await requireUser(request);
    const { planId } = await context.params;
    return json({ items: await listPackages(user.id, planId) });
  } catch (error) {
    return errorResponse(error);
  }
}
