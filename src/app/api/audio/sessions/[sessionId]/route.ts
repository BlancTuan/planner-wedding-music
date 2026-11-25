import { requireUser } from "@/server/auth";
import { deleteAudioSession, readAudioSession } from "@/server/audio/sessions";
import { errorResponse, json } from "@/server/http";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await requireUser(request);
    const { sessionId } = await context.params;
    return json(await readAudioSession(user.id, sessionId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await requireUser(request);
    const { sessionId } = await context.params;
    return json(await deleteAudioSession(user.id, sessionId));
  } catch (error) {
    return errorResponse(error);
  }
}
