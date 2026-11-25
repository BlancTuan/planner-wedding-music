import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderRevisionMp3 } from "@/server/media/export-mp3";

describe("MP3 export", () => {
  it("writes a real MP3 of the selected trim", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wmp-mp3-"));
    const wav = path.join(dir, "source.wav");
    const mp3 = path.join(dir, "out.mp3");
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=3",
      "-ac",
      "1",
      wav,
    ]);
    const result = await renderRevisionMp3({
      sourcePath: wav,
      outputPath: mp3,
      trimStartMs: 1000,
      trimEndMs: 2000,
      fadeInMs: 50,
      fadeOutMs: 50,
      gainDb: -3,
    });
    expect(result.codec).toBe("mp3");
    expect(result.durationMs).toBeGreaterThan(800);
    expect(result.durationMs).toBeLessThan(1300);
  });
});
