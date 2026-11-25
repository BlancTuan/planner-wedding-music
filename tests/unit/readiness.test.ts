import { describe, expect, it } from "vitest";
import { evaluateReadiness, invalidateApproval } from "@/server/readiness";

describe("readiness", () => {
  it("names a required stage that has no cue", () => {
    const checks = evaluateReadiness([
      { id: "stage-1", name: "Lối vào cô dâu", status: "MUSIC_REQUIRED", cues: [] },
    ]);
    expect(checks.map((check) => check.code)).toContain("STAGE_MISSING_CUES");
    expect(checks[0].message).toContain("Lối vào cô dâu");
  });

  it("does not treat a completed export as listening approval", () => {
    const checks = evaluateReadiness([
      {
        id: "stage-1",
        name: "Nâng ly",
        status: "MUSIC_REQUIRED",
        cues: [
          {
            id: "cue-1",
            revisionId: "rev-1",
            assetStatus: "READY",
            exportState: "COMPLETED",
            listeningApproved: false,
            permission: "PREVIEW_ALLOWED",
            durationDeltaMs: 0,
          },
        ],
      },
    ]);
    expect(checks.map((check) => check.code)).toContain("UNREVIEWED_CUE");
  });

  it("names a cue that has no export or only a cancelled one", () => {
    const cue = {
      revisionId: "rev-1",
      assetStatus: "READY" as const,
      listeningApproved: true,
      permission: "PREVIEW_ALLOWED" as const,
      durationDeltaMs: null,
    };
    const checks = evaluateReadiness([
      {
        id: "stage-1",
        name: "Cắt bánh",
        status: "MUSIC_REQUIRED",
        cues: [
          { ...cue, id: "cue-1", exportState: "NONE" },
          { ...cue, id: "cue-2", exportState: "CANCELLED" },
        ],
      },
    ]);
    expect(checks.map((check) => [check.code, check.cueId])).toEqual([
      ["MISSING_EXPORT", "cue-1"],
      ["MISSING_EXPORT", "cue-2"],
    ]);
  });

  it("clears a ready plan after a relevant edit", () => {
    expect(invalidateApproval({ state: "READY", version: 2, listeningApprovedAt: "2026-11-19" })).toEqual({
      state: "NEEDS_REVIEW",
      version: 3,
      listeningApprovedAt: null,
    });
  });
});
