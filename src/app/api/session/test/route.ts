import { z } from "zod";
import { openSession } from "@/server/auth";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { errorResponse, json, parseBody, rateLimit, readJson, sessionCookie } from "@/server/http";

const bodySchema = z.object({
  subject: z.string().min(1).max(255),
  displayName: z.string().min(1).max(120),
});

export async function POST(request: Request) {
  try {
    if (!getEnv().authTestMode) throw new AppError(404, "NOT_FOUND", "Phiên kiểm thử không được bật.");
    rateLimit("test-session", 30);
    const body = parseBody(bodySchema, await readJson(request));
    const session = await openSession(body);
    return json({ user: session.user }, 201, { "set-cookie": sessionCookie(session.token) });
  } catch (error) {
    return errorResponse(error);
  }
}
