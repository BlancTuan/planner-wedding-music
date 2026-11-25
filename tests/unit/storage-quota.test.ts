import { describe, expect, it } from "vitest";
import { deletionBlocked, quotaDecision } from "@/server/storage/quota";

describe("storage quota and deletion", () => {
  it("rejects an upload that would pass the quota or the file limit", () => {
    expect(quotaDecision(900, 1000, 200)).toBe("QUOTA_EXCEEDED");
    expect(quotaDecision(0, 1000, 100)).toBeNull();
    expect(quotaDecision(0, 999999999, 104857601)).toBe("FILE_TOO_LARGE");
  });

  it("blocks deletion when a plan still references the asset", () => {
    expect(deletionBlocked(["Kế hoạch A"])).toEqual({
      code: "ASSET_IN_USE",
      plans: ["Kế hoạch A"],
    });
    expect(deletionBlocked([])).toBeNull();
  });
});