import { requireUser } from "@/server/auth";
import { AppError } from "@/server/errors";
import { errorResponse, json, rateLimit } from "@/server/http";
import { saveCatalogTrackToLibrary } from "@/server/media/assets";

export async function POST(request: Request, context: { params: Promise<{ trackId: string }> }) {
  try {
    const user = await requireUser(request);
    rateLimit(`catalog-library:${user.id}`, 30);
    const key = request.headers.get("idempotency-key");
    if (!key || key.length > 200) throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Thiếu khóa thử lại.");
    const { trackId } = await context.params;
    const saved = await saveCatalogTrackToLibrary({ userId: user.id, trackId, idempotencyKey: key });
    return json(saved, saved.alreadySaved ? 200 : 201);
  } catch (error) {
    return errorResponse(error);
  }
}
