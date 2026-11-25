import { z } from "zod";
import { requireUser } from "@/server/auth";
import { AppError } from "@/server/errors";
import { errorResponse, json, parseBody, readJson } from "@/server/http";
import { createImport } from "@/server/youtube/imports";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const key = request.headers.get("idempotency-key");
    if (!key) throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Thiếu khóa thử lại.");
    const body = parseBody(z.object({ url: z.string().min(1).max(2000) }), await readJson(request));
    return json(await createImport(user.id, body.url, key), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
