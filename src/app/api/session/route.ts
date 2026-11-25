import { userFromToken } from "@/server/auth";
import { errorResponse, json, readCookie } from "@/server/http";

export async function GET(request: Request) {
  try {
    const user = await userFromToken(readCookie(request, "wmp_session"));
    return json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
