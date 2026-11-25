import { describe, expect, it } from "vitest";
import { fullSongEdits, keptDurationMs, outputMsAtSource, sourceMsAtOutput, splitEdits, validateEdits } from "@/server/audio/edits";
import { inspectImportSource } from "@/server/audio/import-policy";
import { byteRange } from "@/server/audio/range";

describe("temporary audio edits", () => {
  it("keeps one full-song region and rejects a split that would invent audio", () => {
    const edits = fullSongEdits(2000);
    expect(edits.segments).toEqual([{ startMs: 0, endMs: 2000 }]);
    expect(validateEdits(edits, 2000)).toBeNull();
    expect(splitEdits(edits, 1000)?.segments).toEqual([
      { startMs: 0, endMs: 1000 },
      { startMs: 1000, endMs: 2000 },
    ]);
    expect(splitEdits(edits, 20)).toBeNull();
    expect(keptDurationMs(splitEdits(edits, 1000)!)).toBe(2000);
  });

  it("maps playback time through the kept segments", () => {
    const edits = {
      segments: [
        { startMs: 0, endMs: 1000 },
        { startMs: 1500, endMs: 2000 },
      ],
      fadeInMs: 0,
      fadeOutMs: 0,
      gainDb: 0,
    };
    expect(sourceMsAtOutput(edits, 500)).toBe(500);
    expect(sourceMsAtOutput(edits, 1200)).toBe(1700);
    expect(outputMsAtSource(edits, 1700)).toBe(1200);
    expect(outputMsAtSource(edits, 1200)).toBe(1000);
  });
});

describe("audio import permission", () => {
  it("allows YouTube download and an uploaded file", () => {
    expect(inspectImportSource({ kind: "youtube" })).toEqual({
      state: "AVAILABLE",
      reasonCode: "YOUTUBE_DOWNLOAD",
    });
    expect(inspectImportSource({ kind: "upload" }).state).toBe("AVAILABLE");
  });
});

describe("audio byte range", () => {
  it("returns a bounded inclusive range", () => {
    expect(byteRange(1000, "bytes=0-99")).toEqual({ start: 0, end: 99 });
    expect(byteRange(1000, "bytes=900-")).toEqual({ start: 900, end: 999 });
    expect(byteRange(1000, "bytes=1000-1001")).toBe("invalid");
    expect(byteRange(1000, null)).toBeNull();
  });
});
