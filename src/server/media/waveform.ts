import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function buildWaveformPeaks(filePath: string, bucketCount: number): Promise<number[]> {
  if (bucketCount < 1) throw new Error("BUCKETS_REQUIRED");
  const { stdout } = await execFileAsync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", filePath, "-ac", "1", "-ar", "8000", "-f", "f32le", "pipe:1"],
    { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
  );
  const bytes = stdout as unknown as Buffer;
  const sampleCount = Math.floor(bytes.byteLength / 4);
  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = bytes.readFloatLE(index * 4);
  }
  const peaks = new Array<number>(bucketCount).fill(0);
  const bucketSize = Math.max(1, Math.floor(sampleCount / bucketCount));
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = bucket * bucketSize;
    const end = bucket === bucketCount - 1 ? sampleCount : Math.min(sampleCount, start + bucketSize);
    let peak = 0;
    for (let index = start; index < end; index += 1) {
      peak = Math.max(peak, Math.abs(samples[index] ?? 0));
    }
    peaks[bucket] = peak;
  }
  return peaks;
}
