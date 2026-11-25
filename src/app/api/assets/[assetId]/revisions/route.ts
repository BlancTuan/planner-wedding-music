import { z } from "zod";
import { requireUser } from "@/server/auth";
import { AppError } from "@/server/errors";
import { errorResponse, json, parseBody, readJson } from "@/server/http";
import { listRevisions, saveRevision } from "@/server/media/assets";
import { REVISION_NAME_MAX } from "@/server/media/revision-rules";

const schema = z.object({
  trimStartMs: z.number().int(),
  trimEndMs: z.number().int(),
  fadeInMs: z.number().int(),
  fadeOutMs: z.number().int(),
  gainDb: z.number(),
  name: z.string().trim().min(1).max(REVISION_NAME_MAX),
});

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  try {
    const user = await requireUser(request);
    const { assetId } = await context.params;
    return json({ items: await listRevisions(user.id, assetId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ assetId: string }> }) {
  try {
    const user = await requireUser(request);
    const key = request.headers.get("idempotency-key");
    if (!key) throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Thiếu khóa thử lại.");
    const { assetId } = await context.params;
    const body = parseBody(schema, await readJson(request));
    return json(await saveRevision({ userId: user.id, assetId, idempotencyKey: key, ...body }), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
