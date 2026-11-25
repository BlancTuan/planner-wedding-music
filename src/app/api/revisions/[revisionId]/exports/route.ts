import { requireUser } from "@/server/auth";
import { AppError } from "@/server/errors";
import { errorResponse, json } from "@/server/http";
import { queueExport } from "@/server/media/assets";

export async function POST(request: Request, context: { params: Promise<{ revisionId: string }> }) {
  try {
    const user = await requireUser(request);
    const key = request.headers.get("idempotency-key");
    if (!key) throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Thiếu khóa thử lại.");
    const { revisionId } = await context.params;
    return json(await queueExport(user.id, revisionId, key), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
