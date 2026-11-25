import { z } from "zod";
import { requireUser } from "@/server/auth";
import { saveSessionEdits } from "@/server/audio/sessions";
import { errorResponse, json, parseBody, readJson } from "@/server/http";

const editsSchema = z.object({
  segments: z.array(z.object({ startMs: z.number().int(), endMs: z.number().int() })).min(1).max(24),
  fadeInMs: z.number().int(),
  fadeOutMs: z.number().int(),
  gainDb: z.number(),
});

export async function PUT(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await requireUser(request);
    const { sessionId } = await context.params;
    const edits = parseBody(editsSchema, await readJson(request));
    return json(await saveSessionEdits(user.id, sessionId, edits));
  } catch (error) {
    return errorResponse(error);
  }
}
