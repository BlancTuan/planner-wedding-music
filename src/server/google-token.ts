import { createRemoteJWKSet, jwtVerify } from "jose";

const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function verifyGoogleIdToken(idToken: string, audience: string) {
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience,
  });
  if (!payload.sub) {
    throw new Error("IDENTITY_REQUIRED");
  }
  return {
    subject: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    displayName: typeof payload.name === "string" ? payload.name.slice(0, 120) : "Người dùng",
    avatarUrl: typeof payload.picture === "string" ? payload.picture : null,
  };
}
