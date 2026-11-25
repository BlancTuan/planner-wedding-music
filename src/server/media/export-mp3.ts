import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function renderRevisionMp3(input: {
  sourcePath: string;
  outputPath: string;
  trimStartMs: number;
  trimEndMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  gainDb: number;
  signal?: AbortSignal;
}): Promise<{ codec: string; durationMs: number }> {
  const start = (input.trimStartMs / 1000).toFixed(3);
  const end = (input.trimEndMs / 1000).toFixed(3);
  const clip = (input.trimEndMs - input.trimStartMs) / 1000;
  const fadeIn = Math.min(clip, input.fadeInMs / 1000);
  const fadeOut = Math.min(clip, input.fadeOutMs / 1000);
  const fadeOutStart = Math.max(0, clip - fadeOut);
  const filter = [
    `atrim=start=${start}:end=${end}`,
    "asetpts=PTS-STARTPTS",
    `afade=t=in:st=0:d=${fadeIn.toFixed(3)}`,
    `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOut.toFixed(3)}`,
    `volume=${input.gainDb}dB`,
  ].join(",");
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input.sourcePath,
    "-af",
    filter,
    "-ar",
    "44100",
    "-ac",
    "2",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "192k",
    input.outputPath,
  ], { timeout: 120_000, killSignal: "SIGKILL", signal: input.signal });
  const { stdout } = await execFileAsync("ffprobe", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    input.outputPath,
  ], { timeout: 30_000, killSignal: "SIGKILL", signal: input.signal });
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_name?: string; codec_type?: string }>;
  };
  const stream = parsed.streams?.find((item) => item.codec_type === "audio");
  return {
    codec: stream?.codec_name ?? "",
    durationMs: Math.round(Number(parsed.format?.duration ?? "0") * 1000),
  };
}
