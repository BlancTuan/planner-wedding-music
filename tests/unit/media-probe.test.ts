import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { probeAudioFile } from "@/server/media/probe";

describe("upload probe", () => {
  it("accepts a real WAV and rejects a renamed text file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wmp-probe-"));
    const wav = path.join(dir, "tone.wav");
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1.2",
      "-ac",
      "1",
      wav,
    ]);
    const text = path.join(dir, "fake.mp3");
    writeFileSync(text, "not audio");

    const good = await probeAudioFile(wav, 2000);
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.format).toBe("WAV");
      expect(good.durationMs).toBeGreaterThan(1000);
    }

    const bad = await probeAudioFile(text, 20);
    expect(bad.ok).toBe(false);
  });
});
