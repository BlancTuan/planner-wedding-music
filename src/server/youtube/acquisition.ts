import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";

export type AcquisitionInspection = {
  acquisitionState: "AVAILABLE" | "BLOCKED" | "UNAVAILABLE";
  reasonCode: string;
};

export type Acquirer = (videoId: string, outputDir: string, signal?: AbortSignal) => Promise<string>;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_SOURCE_SECONDS = 600;
const DOWNLOAD_TIMEOUT_MS = 300_000;

export function inspectAcquisition(videoId: string): AcquisitionInspection {
  if (videoId.startsWith("fixture:")) {
    if (videoId.includes("://") || videoId.toLowerCase().includes("youtube")) {
      return { acquisitionState: "BLOCKED", reasonCode: "UNTRUSTED_FIXTURE" };
    }
    return { acquisitionState: "AVAILABLE", reasonCode: "LOCAL_FIXTURE" };
  }
  if (!VIDEO_ID.test(videoId)) return { acquisitionState: "UNAVAILABLE", reasonCode: "INVALID_VIDEO_ID" };
  return { acquisitionState: "AVAILABLE", reasonCode: "YOUTUBE_DOWNLOAD" };
}

export function ytDlpArgs(videoId: string, outputDir: string): string[] {
  if (!VIDEO_ID.test(videoId)) throw new AppError(422, "INVALID_VIDEO_ID", "Mã video YouTube không hợp lệ.");
  return [
    "--no-playlist",
    "--no-progress",
    "--no-warnings",
    "--quiet",
    "--no-cache-dir",
    "--no-mtime",
    "--format",
    "bestaudio/best",
    "--max-filesize",
    "100M",
    "--match-filter",
    `!is_live & duration <= ${MAX_SOURCE_SECONDS}`,
    "--extract-audio",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "2",
    "-o",
    path.join(outputDir, "audio.%(ext)s"),
    "--",
    `https://www.youtube.com/watch?v=${videoId}`,
  ];
}

export function classifyDownloadError(stderr: string): string {
  if (/max-filesize/i.test(stderr)) return "FILE_TOO_LARGE";
  if (
    /private video|video unavailable|not available|has been removed|members-only|confirm your age|account associated with this video has been terminated/i.test(
      stderr,
    )
  ) {
    return "VIDEO_UNAVAILABLE";
  }
  return "DOWNLOAD_FAILED";
}

const downloadMessages: Record<string, string> = {
  VIDEO_UNAVAILABLE: "Video riêng tư, đã gỡ, giới hạn độ tuổi, hoặc không xem được.",
  FILE_TOO_LARGE: "Audio của video vượt quá kích thước cho phép.",
  DURATION_EXCEEDED: "Video dài hơn 10 phút hoặc đang phát trực tiếp.",
  DOWNLOADER_MISSING: "Máy chủ chưa cài yt-dlp nên không tải được audio.",
  DOWNLOAD_FAILED: "Không tải được audio từ YouTube.",
};

function downloadError(code: string): AppError {
  return new AppError(422, code, downloadMessages[code] ?? downloadMessages.DOWNLOAD_FAILED);
}

export const acquireYouTubeAudio: Acquirer = async (videoId, outputDir, signal) => {
  const args = ytDlpArgs(videoId, outputDir);
  await new Promise<void>((resolve, reject) => {
    execFile(
      getEnv().ytDlpPath,
      args,
      { timeout: DOWNLOAD_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, signal },
      (error, _stdout, stderr) => {
        if (!error) return resolve();
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return reject(downloadError("DOWNLOADER_MISSING"));
        const code = classifyDownloadError(String(stderr));
        console.error(`yt-dlp ${videoId} failed ${code}: ${String(stderr).slice(0, 500)}`);
        reject(downloadError(code));
      },
    );
  });
  const produced = (await readdir(outputDir)).find((name) => name.startsWith("audio.") && name.endsWith(".mp3"));
  if (!produced) throw downloadError("DURATION_EXCEEDED");
  return path.join(outputDir, produced);
};
