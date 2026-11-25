import { describe, expect, it } from "vitest";
import { deletionAllowed } from "@/server/auth/identity";

describe("account deletion", () => {
  it("requires an explicit confirmation and the current version", () => {
    expect(deletionAllowed({ confirm: true, version: 3, currentVersion: 3 })).toBe(true);
    expect(deletionAllowed({ confirm: false, version: 3, currentVersion: 3 })).toBe(false);
    expect(deletionAllowed({ confirm: true, version: 2, currentVersion: 3 })).toBe(false);
  });
});
