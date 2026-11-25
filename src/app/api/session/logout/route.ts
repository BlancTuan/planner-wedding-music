import { revokeToken } from "@/server/auth";
import { clearSessionCookie, errorResponse, json, readCookie } from "@/server/http";

export async function POST(request: Request) {
  try {
    await revokeToken(readCookie(request, "wmp_session"));
    return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
  } catch (error) {
    return errorResponse(error);
  }
}
