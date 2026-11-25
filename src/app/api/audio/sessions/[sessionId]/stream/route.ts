import { requireUser } from "@/server/auth";
import { byteRange } from "@/server/audio/range";
import { readSessionAudio } from "@/server/audio/sessions";
import { errorResponse } from "@/server/http";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await requireUser(request);
    const { sessionId } = await context.params;
    const bytes = await readSessionAudio(user.id, sessionId);
    const range = byteRange(bytes.length, request.headers.get("range"));
    if (range === "invalid") {
      return new Response(null, {
        status: 416,
        headers: {
          "content-range": `bytes */${bytes.length}`,
          "accept-ranges": "bytes",
          "cache-control": "private, no-store",
        },
      });
    }
    const body = new Uint8Array(range ? bytes.subarray(range.start, range.end + 1) : bytes);
    return new Response(body, {
      status: range ? 206 : 200,
      headers: {
        "content-type": "audio/mpeg",
        "accept-ranges": "bytes",
        "content-length": String(body.length),
        "cache-control": "private, no-store",
        ...(range ? { "content-range": `bytes ${range.start}-${range.end}/${bytes.length}` } : {}),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
