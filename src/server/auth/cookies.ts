export function secureAttr(): string {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

export function oauthCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureAttr()}`;
}

export function clearOauthCookies(headers: Headers): Headers {
  headers.append("set-cookie", oauthCookie("wmp_oauth_state", "", 0));
  headers.append("set-cookie", oauthCookie("wmp_return", "", 0));
  return headers;
}
