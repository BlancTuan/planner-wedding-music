import { z } from "zod";
import { requireUser } from "@/server/auth";
import { importSessionFixture, importSessionUpload } from "@/server/audio/sessions";
import { AppError } from "@/server/errors";
import { errorResponse, json, parseBody, rateLimit, readJson } from "@/server/http";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await requireUser(request);
    rateLimit(`audio-import:${user.id}`, 20);
    const { sessionId } = await context.params;
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("application/json")) {
      const body = parseBody(z.object({ source: z.string().min(1).max(80) }), await readJson(request));
      if (!body.source.startsWith("fixture:")) {
        throw new AppError(422, "UNSUPPORTED_SOURCE", "Phiên sửa chỉ nhận file nhạc. Hãy dùng nút Tải audio để tải từ YouTube.");
      }
      return json(await importSessionFixture(user.id, sessionId, body.source));
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError(422, "FILE_REQUIRED", "Hãy chọn file nhạc.");
    return json(await importSessionUpload(user.id, sessionId, Buffer.from(await file.arrayBuffer())));
  } catch (error) {
    return errorResponse(error);
  }
}
