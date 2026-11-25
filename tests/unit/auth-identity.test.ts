import { describe, expect, it } from "vitest";
import { linkGoogleSubject, sessionIsActive } from "@/server/auth/identity";

describe("Google identity linking", () => {
  it("returns the existing user when the same subject signs in again", () => {
    const result = linkGoogleSubject(
      [{ provider: "google", subject: "sub-a", userId: "user-1" }],
      "google",
      "sub-a",
    );
    expect(result).toEqual({ userId: "user-1", created: false });
  });

  it("does not reuse an account for a different subject", () => {
    const result = linkGoogleSubject(
      [{ provider: "google", subject: "sub-a", userId: "user-1" }],
      "google",
      "sub-b",
    );
    expect(result.created).toBe(true);
    expect(result.userId).not.toBe("user-1");
  });

  it("does not treat email as the identity key", () => {
    const result = linkGoogleSubject(
      [{ provider: "google", subject: "sub-a", userId: "user-1", email: "a@example.com" }],
      "google",
      "sub-b",
      "a@example.com",
    );
    expect(result.created).toBe(true);
    expect(result.userId).not.toBe("user-1");
  });

  it("rejects an empty subject", () => {
    expect(() => linkGoogleSubject([], "google", "")).toThrow("IDENTITY_REQUIRED");
  });
});

describe("sessions", () => {
  it("is inactive after revocation or expiry", () => {
    const now = new Date("2026-11-19T12:00:00Z");
    expect(
      sessionIsActive({ expiresAt: "2026-11-19T13:00:00Z", revokedAt: null }, now),
    ).toBe(true);
    expect(
      sessionIsActive(
        { expiresAt: "2026-11-19T13:00:00Z", revokedAt: "2026-11-19T12:30:00Z" },
        now,
      ),
    ).toBe(false);
    expect(
      sessionIsActive({ expiresAt: "2026-11-19T11:00:00Z", revokedAt: null }, now),
    ).toBe(false);
  });
});
