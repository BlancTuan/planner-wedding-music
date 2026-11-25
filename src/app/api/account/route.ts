import { z } from "zod";
import { deleteAccount, requireUser, revokeToken } from "@/server/auth";
import { clearSessionCookie, errorResponse, json, parseBody, readCookie, readJson } from "@/server/http";

export async function DELETE(request: Request) {
  try {
    const user = await requireUser(request);
    const body = parseBody(z.object({ confirm: z.literal(true), version: z.number().int() }), await readJson(request));
    await deleteAccount(user, body.confirm, body.version);
    await revokeToken(readCookie(request, "wmp_session"));
    return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
  } catch (error) {
    return errorResponse(error);
  }
}
