import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyDownloadError, inspectAcquisition, ytDlpArgs } from "@/server/youtube/acquisition";
import { parseYouTubeUrl } from "@/server/youtube/url";

describe("YouTube URL and acquisition", () => {
  it("normalizes watch, short, and shorts URLs and ignores playlist extras", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123")).toEqual({
      videoId: "dQw4w9WgXcQ",
    });
    expect(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({ videoId: "dQw4w9WgXcQ" });
    expect(parseYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual({
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("rejects malformed URLs and non-YouTube hosts", () => {
    expect(parseYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ")).toEqual({
      error: "MALFORMED_URL",
    });
    expect(parseYouTubeUrl("not a url")).toEqual({ error: "MALFORMED_URL" });
  });

  it("allows a YouTube download for a valid video id and a local fixture id", () => {
    expect(inspectAcquisition("dQw4w9WgXcQ")).toEqual({
      acquisitionState: "AVAILABLE",
      reasonCode: "YOUTUBE_DOWNLOAD",
    });
    expect(inspectAcquisition("fixture:tone")).toEqual({
      acquisitionState: "AVAILABLE",
      reasonCode: "LOCAL_FIXTURE",
    });
    expect(inspectAcquisition("fixture:https://youtube.com/watch?v=dQw4w9WgXcQ").acquisitionState).toBe(
      "BLOCKED",
    );
    expect(inspectAcquisition("../etc/passwd")).toEqual({
      acquisitionState: "UNAVAILABLE",
      reasonCode: "INVALID_VIDEO_ID",
    });
  });

  it("passes only the canonical video URL to yt-dlp after the option terminator", () => {
    const args = ytDlpArgs("dQw4w9WgXcQ", "/data/job");
    expect(args).toContain("--no-playlist");
    expect(args).toContain("mp3");
    expect(args.slice(-2)).toEqual(["--", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"]);
    expect(args[args.indexOf("-o") + 1]).toBe(path.join("/data/job", "audio.%(ext)s"));
    expect(args[args.indexOf("--match-filter") + 1]).toBe("!is_live & duration <= 600");
  });

  it("refuses to build yt-dlp arguments for an unsafe id", () => {
    expect(() => ytDlpArgs("--exec=rm", "/data/job")).toThrow();
    expect(() => ytDlpArgs("https://evil.example/x", "/data/job")).toThrow();
  });

  it("maps yt-dlp errors to product codes", () => {
    expect(classifyDownloadError("ERROR: [youtube] abc: Private video. Sign in if you've been granted access")).toBe(
      "VIDEO_UNAVAILABLE",
    );
    expect(classifyDownloadError("ERROR: [youtube] abc: Video unavailable")).toBe("VIDEO_UNAVAILABLE");
    expect(classifyDownloadError("ERROR: Sign in to confirm your age")).toBe("VIDEO_UNAVAILABLE");
    expect(classifyDownloadError("File is larger than max-filesize")).toBe("FILE_TOO_LARGE");
    expect(classifyDownloadError("ERROR: unable to download video data: HTTP Error 403")).toBe("DOWNLOAD_FAILED");
  });
});
