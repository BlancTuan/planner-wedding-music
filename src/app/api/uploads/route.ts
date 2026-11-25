import { requireUser } from "@/server/auth";
import { AppError } from "@/server/errors";
import { errorResponse, json, rateLimit } from "@/server/http";
import { createUpload } from "@/server/media/assets";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    rateLimit(`upload:${user.id}`, 20);
    const key = request.headers.get("idempotency-key");
    if (!key) throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Thiếu khóa thử lại.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError(422, "VALIDATION_ERROR", "Chưa chọn tệp nhạc.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const job = await createUpload({ userId: user.id, filename: file.name, bytes, idempotencyKey: key });
    return json(job, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
