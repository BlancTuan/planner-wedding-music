import { z } from "zod";
import { requireUser } from "@/server/auth";
import { errorResponse, json, parseBody, readJson } from "@/server/http";
import { lookupYouTubeMetadata } from "@/server/youtube/metadata";

export async function POST(request: Request) {
  try {
    await requireUser(request);
    const body = parseBody(z.object({ url: z.string().min(1).max(2000) }), await readJson(request));
    return json(await lookupYouTubeMetadata(body.url));
  } catch (error) {
    return errorResponse(error);
  }
}
