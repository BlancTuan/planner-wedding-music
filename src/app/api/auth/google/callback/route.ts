import { openSession } from "@/server/auth";
import { clearOauthCookies } from "@/server/auth/cookies";
import { safeNextPath } from "@/server/auth/redirect";
import { getEnv } from "@/server/env";
import { verifyGoogleIdToken } from "@/server/google-token";
import { readCookie, sessionCookie } from "@/server/http";

function redirectTo(location: URL, sessionSetCookie?: string): Response {
  const headers = clearOauthCookies(new Headers());
  headers.set("location", location.toString());
  if (sessionSetCookie) headers.append("set-cookie", sessionSetCookie);
  return new Response(null, { status: 302, headers });
}

export async function GET(request: Request) {
  const env = getEnv();
  const failure = new URL("/dang-nhap?error=xac-thuc", env.appOrigin);
  try {
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const expected = readCookie(request, "wmp_oauth_state");
    if (!code || !state || state !== expected) return redirectTo(failure);
    const next = safeNextPath(readCookie(request, "wmp_return"));
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: env.googleRedirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) return redirectTo(failure);
    const tokens = (await tokenResponse.json()) as { id_token?: string };
    if (!tokens.id_token) return redirectTo(failure);
    const profile = await verifyGoogleIdToken(tokens.id_token, env.googleClientId);
    const session = await openSession(profile);
    return redirectTo(new URL(next, env.appOrigin), sessionCookie(session.token));
  } catch {
    return redirectTo(failure);
  }
}
