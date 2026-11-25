import { describe, expect, it } from "vitest";
import { importOutcome, publicDurationLabel, safeThumbnail } from "@/components/youtube-import-status";

describe("YouTube import status", () => {
  it("offers the download before an import starts and does not claim the audio is ready", () => {
    const outcome = importOutcome({ acquisitionState: "AVAILABLE", errorCode: "YOUTUBE_DOWNLOAD" });
    expect(outcome.tone).toBe("info");
    expect(outcome.editorHref).toBeNull();
    expect(outcome.canDownload).toBe(true);
    expect(outcome.text.toLowerCase()).not.toContain("sẵn sàng");
  });

  it("shows the real reason when a download fails and allows a retry", () => {
    const tooLong = importOutcome({ acquisitionState: "AVAILABLE", errorCode: "DURATION_EXCEEDED", state: "FAILED" });
    expect(tooLong.tone).toBe("error");
    expect(tooLong.text).toContain("10 phút");
    expect(tooLong.canDownload).toBe(true);
    const failed = importOutcome({ acquisitionState: "AVAILABLE", errorCode: "DOWNLOAD_FAILED", state: "FAILED" });
    expect(failed.tone).toBe("error");
    expect(failed.editorHref).toBeNull();
    const missing = importOutcome({ acquisitionState: "AVAILABLE", errorCode: "DOWNLOADER_MISSING", state: "FAILED" });
    expect(missing.text).toContain("yt-dlp");
  });

  it("shows progress while the audio downloads", () => {
    const outcome = importOutcome({ acquisitionState: "AVAILABLE", state: "DOWNLOADING" });
    expect(outcome.tone).toBe("info");
    expect(outcome.canDownload).toBe(false);
  });

  it("opens the editor only after a validated asset exists", () => {
    expect(
      importOutcome({
        acquisitionState: "AVAILABLE",
        state: "READY_FOR_EDITING",
        assetId: "asset-1",
      }).editorHref,
    ).toBe("/bien-tap/asset-1");
    expect(
      importOutcome({
        acquisitionState: "AVAILABLE",
        state: "FAILED",
        assetId: null,
      }).editorHref,
    ).toBeNull();
  });

  it("formats public duration and rejects a non-https thumbnail", () => {
    expect(publicDurationLabel(null)).toBe("Không có trong dữ liệu công khai");
    expect(publicDurationLabel(125_000)).toBe("2:05.0");
    expect(safeThumbnail("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg")).toBe(
      "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
    );
    expect(safeThumbnail("http://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg")).toBeNull();
    expect(safeThumbnail("javascript:alert(1)")).toBeNull();
  });
});
