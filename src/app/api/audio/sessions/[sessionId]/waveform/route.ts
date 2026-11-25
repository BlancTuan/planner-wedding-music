import { requireUser } from "@/server/auth";
import { readSessionWaveform } from "@/server/audio/sessions";
import { errorResponse, json } from "@/server/http";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await requireUser(request);
    const { sessionId } = await context.params;
    return json(await readSessionWaveform(user.id, sessionId));
  } catch (error) {
    return errorResponse(error);
  }
}
