import { z } from "zod";
import { requireUser } from "@/server/auth";
import { createAudioSession } from "@/server/audio/sessions";
import { errorResponse, json, parseBody, rateLimit, readJson } from "@/server/http";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    rateLimit(`audio-session:${user.id}`, 30);
    const body = parseBody(z.object({ url: z.string().min(1).max(2000).optional() }), await readJson(request));
    return json(await createAudioSession(user.id, body.url ?? null), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
