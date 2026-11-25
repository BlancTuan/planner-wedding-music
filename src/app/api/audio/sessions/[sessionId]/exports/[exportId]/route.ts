import { requireUser } from "@/server/auth";
import { readSessionExport } from "@/server/audio/sessions";
import { errorResponse } from "@/server/http";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string; exportId: string }> }) {
  try {
    const user = await requireUser(request);
    const { sessionId, exportId } = await context.params;
    const bytes = await readSessionExport(user.id, sessionId, exportId);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "audio/mpeg",
        "content-length": String(bytes.length),
        "content-disposition": "attachment; filename=\"ban-nhac.mp3\"",
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
