import { requireUser } from "@/server/auth";
import { errorResponse, json } from "@/server/http";
import { getPackage } from "@/server/handoff";

export async function GET(request: Request, context: { params: Promise<{ planId: string; packageId: string }> }) {
  try {
    const user = await requireUser(request);
    const { planId, packageId } = await context.params;
    const { storageKey: _storageKey, ...item } = await getPackage(user.id, planId, packageId);
    return json(item);
  } catch (error) {
    return errorResponse(error);
  }
}
