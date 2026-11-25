import { requireAdmin } from "@/server/auth";
import { listAudit, listFailures } from "@/server/admin-catalog";
import { errorResponse, json } from "@/server/http";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const kind = new URL(request.url).searchParams.get("kind");
    return json(kind === "audit" ? { items: await listAudit() } : { items: await listFailures() });
  } catch (error) {
    return errorResponse(error);
  }
}
