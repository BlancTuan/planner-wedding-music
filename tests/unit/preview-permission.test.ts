import { describe, expect, it } from "vitest";
import { canPreview, listeningVolumeChangesGain } from "@/server/catalog/preview";

describe("preview permission", () => {
  it("allows preview only for permitted ready audio", () => {
    expect(canPreview({ usagePermission: "PREVIEW_ALLOWED", assetStatus: "READY" })).toBe(true);
    expect(canPreview({ usagePermission: "METADATA_ONLY", assetStatus: null })).toBe(false);
    expect(canPreview({ usagePermission: "PREVIEW_ALLOWED", assetStatus: "FAILED" })).toBe(false);
    expect(canPreview({ usagePermission: "RESTRICTED", assetStatus: "READY" })).toBe(false);
  });

  it("does not copy listening volume into revision gain", () => {
    expect(listeningVolumeChangesGain()).toBe(false);
  });
});
