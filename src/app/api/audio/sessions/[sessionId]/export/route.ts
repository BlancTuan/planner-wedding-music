import { requireUser } from "@/server/auth";
import { exportSessionAudio } from "@/server/audio/sessions";
import { errorResponse, json } from "@/server/http";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await requireUser(request);
    const { sessionId } = await context.params;
    return json(await exportSessionAudio(user.id, sessionId));
  } catch (error) {
    return errorResponse(error);
  }
}
