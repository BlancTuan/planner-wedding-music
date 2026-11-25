import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { keptDurationMs, type AudioEdits } from "@/server/audio/edits";
import { AppError } from "@/server/errors";
import { probeAudioFile, type ProbeSuccess } from "@/server/media/probe";

const execFileAsync = promisify(execFile);

const probeMessages: Record<string, string> = {
  INVALID_AUDIO: "Nội dung không phải audio hợp lệ.",
  FILE_TOO_LARGE: "File vượt quá kích thước cho phép.",
  DURATION_EXCEEDED: "Bản nhạc dài hơn giới hạn cho phép.",
  UNSUPPORTED_FORMAT: "Chỉ nhận MP3 hoặc WAV.",
};

function probeError(code: string): AppError {
  return new AppError(422, code, probeMessages[code] ?? "Không đọc được audio.");
}

async function runFfmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  await execFileAsync("ffmpeg", args, { timeout: 120_000, signal });
}

export async function convertToEditorMp3(
  inputPath: string,
  outputPath: string,
  signal?: AbortSignal,
): Promise<ProbeSuccess> {
  const before = await probeAudioFile(inputPath);
  if (!before.ok) throw probeError(before.code);
  await mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await runFfmpeg(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        inputPath,
        "-vn",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        outputPath,
      ],
      signal,
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    console.error("audio-convert failed");
    throw new AppError(422, "PROCESSING_FAILED", "Không chuyển được audio.");
  }
  const after = await probeAudioFile(outputPath);
  if (!after.ok || after.format !== "MP3") {
    throw new AppError(422, "PROCESSING_FAILED", "File sau chuyển đổi không phát được.");
  }
  if (Math.abs(after.durationMs - before.durationMs) > 500) {
    throw new AppError(422, "DURATION_MISMATCH", "File sau chuyển đổi không giữ đủ độ dài.");
  }
  return after;
}

export async function renderEditsMp3(input: {
  sourcePath: string;
  outputPath: string;
  edits: AudioEdits;
  signal?: AbortSignal;
}): Promise<{ durationMs: number }> {
  const filters: string[] = [];
  const labels: string[] = [];
  input.edits.segments.forEach((segment, index) => {
    const start = (segment.startMs / 1000).toFixed(3);
    const end = (segment.endMs / 1000).toFixed(3);
    filters.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`);
    labels.push(`[a${index}]`);
  });
  const keptMs = keptDurationMs(input.edits);
  const kept = keptMs / 1000;
  const fadeIn = Math.min(kept, input.edits.fadeInMs / 1000);
  const fadeOut = Math.min(Math.max(0, kept - fadeIn), input.edits.fadeOutMs / 1000);
  const chain: string[] = [];
  if (fadeIn > 0) chain.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
  if (fadeOut > 0) chain.push(`afade=t=out:st=${Math.max(0, kept - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`);
  chain.push(`volume=${input.edits.gainDb}dB`);
  filters.push(`${labels.join("")}concat=n=${labels.length}:v=0:a=1[cat]`);
  filters.push(`[cat]${chain.join(",")}[out]`);
  await mkdir(path.dirname(input.outputPath), { recursive: true });
  try {
    await runFfmpeg(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        input.sourcePath,
        "-filter_complex",
        filters.join(";"),
        "-map",
        "[out]",
        "-vn",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        input.outputPath,
      ],
      input.signal,
    );
  } catch (error) {
    if (input.signal?.aborted) throw error;
    console.error("audio-render failed");
    throw new AppError(422, "RENDER_FAILED", "Không xuất được file MP3.");
  }
  const probed = await probeAudioFile(input.outputPath);
  if (!probed.ok || probed.format !== "MP3") {
    throw new AppError(422, "RENDER_FAILED", "File xuất không phát được.");
  }
  if (Math.abs(probed.durationMs - keptMs) > 400) {
    throw new AppError(422, "RENDER_FAILED", "File xuất không khớp với phần đã sửa.");
  }
  return { durationMs: probed.durationMs };
}
