import { describe, expect, it } from "vitest";
import { shownPlayhead } from "@/components/playback-clock";

describe("playback clock", () => {
  it("shows the live playhead ahead of a stale cursor and the trim start", () => {
    expect(shownPlayhead(2500, 400, 0)).toBe(2500);
    expect(shownPlayhead(null, 1500, 0)).toBe(1500);
    expect(shownPlayhead(null, null, 0)).toBe(0);
  });
});
