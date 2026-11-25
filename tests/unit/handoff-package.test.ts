import { describe, expect, it } from "vitest";
import { assignExportNames, packageIsOutdated, requiredPackageEntries } from "@/server/handoff/package";

describe("handoff package", () => {
  it("skips excluded stages and avoids duplicate file names", () => {
    const names = assignExportNames(["Đón khách", "Đón khách", ""]);
    expect(new Set(names).size).toBe(3);
    expect(names.every((name) => name.endsWith(".mp3"))).toBe(true);
    const entries = requiredPackageEntries([
      { status: "SKIPPED", cues: [{ fileName: "a.mp3" }] },
      { status: "NO_MUSIC", cues: [{ fileName: "b.mp3" }] },
      { status: "MUSIC_REQUIRED", cues: [{ fileName: "c.mp3" }] },
    ]);
    expect(entries).toEqual(["c.mp3", "huong-dan.pdf", "huong-dan.csv"]);
  });

  it("marks a package outdated when the plan version changes", () => {
    expect(packageIsOutdated(4, 4)).toBe(false);
    expect(packageIsOutdated(4, 5)).toBe(true);
  });
});
