import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_BYTES = 104857600;
const MAX_SOURCE_MS = 600000;

type ProbeJson = {
  format?: { duration?: string };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    sample_rate?: string;
    channels?: number;
  }>;
};

export type ProbeSuccess = {
  ok: true;
  format: "MP3" | "WAV";
  durationMs: number;
  sampleRate: number;
  channels: number;
  byteSize: number;
};

export type ProbeFailure = { ok: false; code: string };

export async function probeAudioFile(
  filePath: string,
  maxDurationMs = MAX_SOURCE_MS,
): Promise<ProbeSuccess | ProbeFailure> {
  const info = await stat(filePath);
  if (info.size <= 0 || info.size > MAX_BYTES) {
    return { ok: false, code: "FILE_TOO_LARGE" };
  }
  let stdout = "";
  try {
    const result = await execFileAsync("ffprobe", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]);
    stdout = result.stdout;
  } catch {
    return { ok: false, code: "INVALID_AUDIO" };
  }
  const parsed = JSON.parse(stdout) as ProbeJson;
  const stream = parsed.streams?.find((item) => item.codec_type === "audio");
  if (!stream?.codec_name) return { ok: false, code: "INVALID_AUDIO" };
  const format = stream.codec_name === "mp3" ? "MP3" : stream.codec_name === "pcm_s16le" ? "WAV" : null;
  if (!format) return { ok: false, code: "UNSUPPORTED_FORMAT" };
  const durationMs = Math.round(Number(parsed.format?.duration ?? "0") * 1000);
  if (!durationMs || durationMs > Math.min(maxDurationMs, MAX_SOURCE_MS)) {
    return { ok: false, code: "DURATION_EXCEEDED" };
  }
  return {
    ok: true,
    format,
    durationMs,
    sampleRate: Number(stream.sample_rate ?? 0),
    channels: stream.channels ?? 0,
    byteSize: info.size,
  };
}
