import { requireUser } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { exportFile } from "@/server/media/assets";

export async function GET(request: Request, context: { params: Promise<{ exportId: string }> }) {
  try {
    const user = await requireUser(request);
    const { exportId } = await context.params;
    const bytes = await exportFile(user.id, exportId);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "audio/mpeg",
        "content-disposition": `attachment; filename="ban-nhac-${exportId}.mp3"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
