import { randomBytes } from "node:crypto";
import { oauthCookie } from "@/server/auth/cookies";
import { safeNextPath } from "@/server/auth/redirect";
import { getEnv } from "@/server/env";

export async function GET(request: Request) {
  const env = getEnv();
  if (!env.googleClientId || !env.googleClientSecret) {
    return Response.redirect(new URL("/dang-nhap?error=chua-cau-hinh", env.appOrigin));
  }
  const state = randomBytes(16).toString("hex");
  const safeNext = safeNextPath(new URL(request.url).searchParams.get("next"));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.googleClientId);
  url.searchParams.set("redirect_uri", env.googleRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  const headers = new Headers();
  headers.set("location", url.toString());
  headers.append("set-cookie", oauthCookie("wmp_oauth_state", state, 600));
  headers.append("set-cookie", oauthCookie("wmp_return", encodeURIComponent(safeNext), 600));
  return new Response(null, { status: 302, headers });
}
