import { clock } from "@/components/format";

export type ImportTone = "info" | "ok" | "warn" | "error";

export type ImportOutcome = {
  tone: ImportTone;
  text: string;
  editorHref: string | null;
  canDownload: boolean;
};

const ACTIVE_STATES = new Set(["PENDING", "FETCHING_METADATA", "DOWNLOADING", "EXTRACTING_AUDIO", "GENERATING_WAVEFORM"]);

const failureText: Record<string, string> = {
  VIDEO_UNAVAILABLE: "Video riêng tư, đã gỡ, giới hạn độ tuổi, hoặc không xem được.",
  DURATION_EXCEEDED: "Video dài hơn 10 phút hoặc đang phát trực tiếp nên không tải được.",
  FILE_TOO_LARGE: "Audio của video vượt quá kích thước cho phép.",
  QUOTA_EXCEEDED: "Audio vượt quá dung lượng còn lại của bạn.",
  DOWNLOADER_MISSING: "Máy chủ chưa cài yt-dlp nên không tải được audio.",
  DOWNLOAD_FAILED: "Không tải được audio từ YouTube. Hãy thử lại sau.",
  INVALID_AUDIO: "Audio tải về không đọc được.",
};

export function publicDurationLabel(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs)) return "Không có trong dữ liệu công khai";
  return clock(durationMs, true);
}

export function safeThumbnail(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function importOutcome(input: {
  acquisitionState: string;
  errorCode?: string | null;
  assetId?: string | null;
  state?: string | null;
}): ImportOutcome {
  if (input.state === "READY_FOR_EDITING" && input.assetId) {
    return {
      tone: "ok",
      text: "Audio đã tải về, có dạng sóng và sẵn sàng để sửa.",
      editorHref: `/bien-tap/${input.assetId}`,
      canDownload: false,
    };
  }
  if (input.state && ACTIVE_STATES.has(input.state)) {
    return {
      tone: "info",
      text: input.state === "GENERATING_WAVEFORM" ? "Đang tạo dạng sóng…" : "Đang tải audio từ YouTube…",
      editorHref: null,
      canDownload: false,
    };
  }
  if (input.acquisitionState === "UNAVAILABLE" || input.errorCode === "VIDEO_UNAVAILABLE") {
    return { tone: "error", text: failureText.VIDEO_UNAVAILABLE, editorHref: null, canDownload: false };
  }
  if (input.state === "FAILED" || (input.errorCode && failureText[input.errorCode])) {
    return {
      tone: "error",
      text: failureText[input.errorCode ?? ""] ?? failureText.DOWNLOAD_FAILED,
      editorHref: null,
      canDownload: input.acquisitionState === "AVAILABLE",
    };
  }
  return {
    tone: "info",
    text: "Có thể tải audio của video này vào thư viện để cắt và sửa trên dạng sóng.",
    editorHref: null,
    canDownload: input.acquisitionState === "AVAILABLE",
  };
}
