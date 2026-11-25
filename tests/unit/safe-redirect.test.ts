import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as startGoogle } from "@/app/api/auth/google/route";
import { GET as googleCallback } from "@/app/api/auth/google/callback/route";
import { safeNextPath } from "@/server/auth/redirect";
import { clearSessionCookie, sessionCookie } from "@/server/http";

describe("safeNextPath", () => {
  it.each([
    ["/\\evil.com"],
    ["/\t/x"],
    ["//x"],
    ["https://x"],
    [""],
    [null],
    [undefined],
    ["/%5Cevil"],
    ["/a\\b"],
    ["/x\u0000y"],
    ["/x\u007fy"],
    ["javascript:alert(1)"],
    ["ke-hoach"],
  ])("falls back for %j", (value) => {
    expect(safeNextPath(value)).toBe("/bang-dieu-khien");
  });

  it.each([["/ke-hoach/1"], ["/thu-vien?q=a"], ["/"]])("keeps %j", (value) => {
    expect(safeNextPath(value)).toBe(value);
  });

  it("never leaves the origin for an accepted value", () => {
    for (const value of ["/%5Cevil", "/%2F%2Fevil.com", "/ke-hoach/1"]) {
      const result = safeNextPath(value);
      expect(new URL(result, "http://app.test").origin).toBe("http://app.test");
    }
  });

  it("uses a custom fallback", () => {
    expect(safeNextPath("//x", "/")).toBe("/");
  });
});

function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

describe("Google sign-in routes", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_GOOGLE_ID", "client-id");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "client-secret");
    vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3000");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("stores only a safe return path", async () => {
    const response = await startGoogle(new Request("http://127.0.0.1:3000/api/auth/google?next=/%5Cevil.com"));
    expect(response.status).toBe(302);
    const returnCookie = setCookies(response).find((value) => value.startsWith("wmp_return="));
    expect(returnCookie).toContain(`wmp_return=${encodeURIComponent("/bang-dieu-khien")};`);
  });

  it("keeps a safe return path", async () => {
    const response = await startGoogle(new Request("http://127.0.0.1:3000/api/auth/google?next=/ke-hoach/1"));
    const returnCookie = setCookies(response).find((value) => value.startsWith("wmp_return="));
    expect(returnCookie).toContain(`wmp_return=${encodeURIComponent("/ke-hoach/1")};`);
  });

  it("marks cookies Secure in production only", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const production = await startGoogle(new Request("http://127.0.0.1:3000/api/auth/google"));
    expect(setCookies(production)).toHaveLength(2);
    for (const cookie of setCookies(production)) expect(cookie).toMatch(/;\s*Secure/i);
    vi.stubEnv("NODE_ENV", "test");
    const development = await startGoogle(new Request("http://127.0.0.1:3000/api/auth/google"));
    for (const cookie of setCookies(development)) expect(cookie).not.toMatch(/Secure/i);
  });

  it("clears OAuth cookies when the state does not match", async () => {
    const response = await googleCallback(
      new Request("http://127.0.0.1:3000/api/auth/google/callback?state=a&code=c", {
        headers: { cookie: "wmp_oauth_state=b; wmp_return=%2Fke-hoach" },
      }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3000/dang-nhap?error=xac-thuc");
    const cookies = setCookies(response);
    expect(cookies.some((value) => value.startsWith("wmp_oauth_state=;") && value.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((value) => value.startsWith("wmp_return=;") && value.includes("Max-Age=0"))).toBe(true);
  });

  it("redirects to the sign-in error when the token exchange throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));
    const response = await googleCallback(
      new Request("http://127.0.0.1:3000/api/auth/google/callback?state=s&code=c", {
        headers: { cookie: "wmp_oauth_state=s; wmp_return=%2Fke-hoach" },
      }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3000/dang-nhap?error=xac-thuc");
    const cookies = setCookies(response);
    expect(cookies.some((value) => value.startsWith("wmp_oauth_state=;") && value.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((value) => value.startsWith("wmp_return=;") && value.includes("Max-Age=0"))).toBe(true);
  });

  it("marks the session cookie Secure in production only", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookie("t")).toMatch(/;\s*Secure$/);
    expect(clearSessionCookie()).toMatch(/;\s*Secure$/);
    vi.stubEnv("NODE_ENV", "test");
    expect(sessionCookie("t")).not.toMatch(/Secure/);
    expect(clearSessionCookie()).not.toMatch(/Secure/);
  });

  it("marks cleared OAuth cookies Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await googleCallback(new Request("http://127.0.0.1:3000/api/auth/google/callback"));
    const cookies = setCookies(response);
    expect(cookies.length).toBeGreaterThanOrEqual(2);
    for (const cookie of cookies) expect(cookie).toMatch(/;\s*Secure/i);
  });
});
