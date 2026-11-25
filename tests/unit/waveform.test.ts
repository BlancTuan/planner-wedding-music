import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWaveformPeaks } from "@/server/media/waveform";

describe("waveform", () => {
  it("builds peaks from real audio and keeps a louder tone above a quiet tone", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wmp-wave-"));
    const loud = path.join(dir, "loud.wav");
    const quiet = path.join(dir, "quiet.wav");
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1:sample_rate=8000",
      "-ac",
      "1",
      loud,
    ]);
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1:sample_rate=8000",
      "-filter:a",
      "volume=0.05",
      "-ac",
      "1",
      quiet,
    ]);
    const loudPeaks = await buildWaveformPeaks(loud, 20);
    const quietPeaks = await buildWaveformPeaks(quiet, 20);
    const loudMax = Math.max(...loudPeaks);
    const quietMax = Math.max(...quietPeaks);
    expect(loudPeaks).toHaveLength(20);
    expect(loudMax).toBeGreaterThan(quietMax);
  });
});
