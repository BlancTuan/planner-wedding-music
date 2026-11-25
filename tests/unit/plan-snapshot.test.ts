import { describe, expect, it } from "vitest";
import { duplicatePlan, snapshotPlaylist } from "@/server/plans/snapshot";

describe("plan snapshots", () => {
  it("keeps cue revisions when the playlist later changes", () => {
    const items = [{ id: "item-1", revisionId: "rev-a", note: "Mở đầu", position: 0 }];
    const cues = snapshotPlaylist(items);
    items[0].revisionId = "rev-b";
    expect(cues[0].revisionId).toBe("rev-a");
    expect(cues[0].playlistItemId).toBe("item-1");
  });

  it("copies a plan without sharing later edits", () => {
    const copy = duplicatePlan({
      name: "Lễ nhà",
      stages: [{ id: "stage-1", name: "Đón khách", cues: [{ id: "cue-1", revisionId: "rev-a" }] }],
    });
    copy.stages[0].name = "Đã sửa";
    expect(copy.stages[0].id).not.toBe("stage-1");
    expect(copy.stages[0].cues[0].revisionId).toBe("rev-a");
  });
});
