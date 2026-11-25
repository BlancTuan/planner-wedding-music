"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { newIdempotencyKey } from "@/components/idempotency-key";
import { AlertIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, ClockIcon, InfoIcon, LinkIcon, UploadIcon } from "@/components/icons";
import { YouTubeImportCard } from "@/components/youtube-import-card";
import { importOutcome, publicDurationLabel } from "@/components/youtube-import-status";
import { parseYouTubeUrl } from "@/server/youtube/url";

type Tone = "info" | "ok" | "warn" | "error";
type Status = { tone: Tone; text: string } | null;

const toneIcons: Record<Tone, ReactNode> = {
  info: <ClockIcon />,
  ok: <CheckIcon />,
  warn: <InfoIcon />,
  error: <AlertIcon />,
};

const uploadStates: Record<string, string> = {
  PROCESSING: "File đang được xử lý.",
  PENDING: "File đang chờ xử lý.",
  FAILED: "File không dùng được.",
};

const uploadErrors: Record<string, string> = {
  INVALID_AUDIO: "Nội dung không phải MP3 hoặc WAV hợp lệ.",
  FILE_TOO_LARGE: "File vượt quá kích thước cho phép.",
  DURATION_EXCEEDED: "Bản nhạc dài hơn giới hạn cho phép.",
  PROCESSING_FAILED: "Không xử lý được file này.",
  QUOTA_EXCEEDED: "File vượt quá dung lượng còn lại.",
};

type VideoMeta = {
  videoId: string;
  title: string | null;
  channelName: string | null;
  thumbnailUrl: string | null;
  durationMs: number | null;
  originalUrl: string;
  acquisitionState: string;
  reasonCode: string | null;
};

type ImportJob = {
  state: string;
  acquisitionState: string;
  errorCode: string | null;
  assetId: string | null;
};

function StatusNotice({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p className={`notice notice-${status.tone}`}>
      {toneIcons[status.tone]}
      <span>{status.text}</span>
    </p>
  );
}

export default function UploadPage() {
  const [progress, setProgress] = useState<Status>(null);
  const [uploaded, setUploaded] = useState(false);
  const [readyAssetId, setReadyAssetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [youtube, setYoutube] = useState("");
  const [info, setInfo] = useState<Status>(null);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);

  async function sendFile(file: File) {
    setBusy(true);
    setUploaded(false);
    setReadyAssetId(null);
    setProgress({ tone: "info", text: `Đang kiểm tra “${file.name}”…` });
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: { "idempotency-key": newIdempotencyKey() },
        body,
      });
      const payload = await response.json();
      if (!response.ok) {
        setProgress({ tone: "error", text: payload.error?.message ?? "Tải lên thất bại." });
        return;
      }
      if (payload.state === "READY") {
        setUploaded(true);
        setReadyAssetId(typeof payload.assetId === "string" ? payload.assetId : null);
        setProgress({ tone: "ok", text: `“${file.name}” đã được kiểm tra và sẵn sàng để sửa.` });
        return;
      }
      const reason = payload.errorCode ? uploadErrors[payload.errorCode] ?? "" : "";
      setProgress({
        tone: "error",
        text: [uploadStates[payload.state] ?? "File chưa sẵn sàng.", reason].filter(Boolean).join(" "),
      });
    } catch {
      setProgress({ tone: "error", text: "Tải lên thất bại." });
    } finally {
      setBusy(false);
    }
  }

  async function openSession(upload: boolean) {
    if (!meta) return;
    setImporting(true);
    setInfo({ tone: "info", text: "Đang mở phiên sửa…" });
    try {
      const response = await fetch("/api/audio/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: meta.originalUrl }),
      });
      const body = await response.json();
      if (!response.ok || typeof body.id !== "string") {
        setNeedsSignIn(body.error?.code === "UNAUTHENTICATED");
        setInfo({ tone: "error", text: body.error?.message ?? "Không mở được phiên sửa." });
        setImporting(false);
        return;
      }
      window.location.href = `/phien/${body.id}${upload ? "?upload=1" : ""}`;
    } catch {
      setInfo({ tone: "error", text: "Không mở được phiên sửa." });
      setImporting(false);
    }
  }

  async function downloadAudio() {
    if (!meta) return;
    setDownloading(true);
    setInfo(null);
    setJob({ state: "DOWNLOADING", acquisitionState: "AVAILABLE", errorCode: null, assetId: null });
    try {
      const response = await fetch("/api/youtube/imports", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": newIdempotencyKey() },
        body: JSON.stringify({ url: meta.originalUrl }),
      });
      const body = await response.json();
      if (!response.ok) {
        setJob(null);
        setNeedsSignIn(body.error?.code === "UNAUTHENTICATED");
        setInfo({ tone: "error", text: body.error?.message ?? "Không tải được audio từ YouTube." });
        return;
      }
      setJob({
        state: body.state,
        acquisitionState: body.acquisitionState,
        errorCode: body.errorCode ?? null,
        assetId: body.assetId ?? null,
      });
    } catch {
      setJob(null);
      setInfo({ tone: "error", text: "Không tải được audio từ YouTube." });
    } finally {
      setDownloading(false);
    }
  }

  async function lookupVideo() {
    setChecking(true);
    setNeedsSignIn(false);
    setJob(null);
    setMeta(null);
    const parsed = parseYouTubeUrl(youtube.trim());
    if ("error" in parsed) {
      setInfo({ tone: "error", text: "Liên kết YouTube không hợp lệ." });
      setChecking(false);
      return;
    }
    setInfo({ tone: "info", text: "Đang lấy thông tin video…" });
    try {
      const metaResponse = await fetch("/api/youtube/metadata", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: youtube.trim() }),
      });
      const metadata = await metaResponse.json();
      if (!metaResponse.ok) {
        setNeedsSignIn(metadata.error?.code === "UNAUTHENTICATED");
        setInfo({ tone: "error", text: metadata.error?.message ?? "Liên kết không hợp lệ." });
        return;
      }
      setMeta({
        videoId: metadata.videoId,
        title: metadata.title ?? null,
        channelName: metadata.channelName ?? null,
        thumbnailUrl: metadata.thumbnailUrl ?? null,
        durationMs: typeof metadata.durationMs === "number" ? metadata.durationMs : null,
        originalUrl: metadata.originalUrl ?? youtube.trim(),
        acquisitionState: metadata.acquisitionState ?? "UNAVAILABLE",
        reasonCode: metadata.reasonCode ?? null,
      });
      setInfo(null);
    } catch {
      setInfo({ tone: "error", text: "Không lấy được thông tin video." });
    } finally {
      setChecking(false);
    }
  }


  return (
    <div className="wrap page">
      <Link href="/thu-vien" className="back-link"><ArrowLeftIcon className="h-4 w-4" />Về thư viện</Link>
      <header className="page-head">
        <div className="min-w-0">
          <h1 className="page-title">Tải nhạc lên</h1>
          <p className="page-lead">Đưa bản nhạc của bạn vào thư viện để cắt đoạn và xuất MP3 cho từng phần lễ.</p>
        </div>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-labelledby="file-title" className="flex flex-col gap-4">
          <h2 id="file-title" className="section-title">Từ máy của bạn</h2>
          <div
            className={`flex flex-col items-center gap-4 rounded-md border-2 border-dashed px-6 py-12 text-center max-md:px-4 max-md:py-8 ${
              dragging ? "border-wine bg-wine-tint" : "border-champagne-deep bg-paper"
            }`}
            onDragEnter={(event) => {
              event.preventDefault();
              dragDepth.current += 1;
              setDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (dragDepth.current === 0) setDragging(false);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file && !busy) void sendFile(file);
            }}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-champagne text-wine" aria-hidden="true">
              <UploadIcon className="h-6 w-6" />
            </span>
            <p className="font-serif text-h3">{dragging ? "Thả file vào đây" : "Kéo file vào đây"}</p>
            <p className="text-muted">hoặc chọn từ máy</p>
            <label className="btn btn-primary cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-wine max-sm:w-full">
              <UploadIcon />
              {busy ? "Đang tải lên…" : "Chọn file"}
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept=".mp3,.wav,audio/mpeg,audio/wav"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void sendFile(file);
                  event.target.value = "";
                }}
              />
            </label>
            <p className="hint">MP3 hoặc WAV. File được kiểm tra nội dung, không chỉ phần đuôi.</p>
          </div>
          <div role="status" aria-live="polite" className="flex flex-col gap-3">
            <StatusNotice status={progress} />
            {readyAssetId ? (
              <Link href={`/bien-tap/${readyAssetId}`} className="btn btn-primary self-start">
                Mở trình sửa
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            ) : null}
            {uploaded ? (
              <Link href="/thu-vien" className="link inline-flex min-h-[44px] items-center gap-2 self-start">
                Mở thư viện
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="youtube-title" className="flex flex-col gap-4">
          <h2 id="youtube-title" className="section-title">Từ YouTube</h2>
          <form
            className="panel flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void lookupVideo();
            }}
          >
            <p className="text-muted">
              Dán liên kết, xem thông tin video, rồi tải audio vào thư viện riêng của bạn để cắt và sửa trên dạng sóng. Video tối đa 10 phút.
            </p>
            <div className="field">
              <label className="label" htmlFor="youtube-url">Liên kết YouTube</label>
              <input
                id="youtube-url"
                inputMode="url"
                value={youtube}
                onChange={(event) => {
                  setYoutube(event.target.value);
                  setMeta(null);
                  setJob(null);
                  setInfo(null);
                }}
                placeholder="https://www.youtube.com/watch?v=…"
                className="input"
              />
            </div>
            <button className="btn btn-secondary self-start max-sm:w-full" type="submit" disabled={checking || youtube.trim() === ""} aria-busy={checking}>
              <LinkIcon />
              {checking ? "Đang lấy thông tin…" : "Xem thông tin"}
            </button>
            <div role="status" aria-live="polite" className="flex flex-col gap-3">
              <StatusNotice status={info} />
              {needsSignIn ? (
                <Link href="/dang-nhap?next=/tai-len" className="link inline-flex min-h-[44px] items-center">
                  Đăng nhập
                </Link>
              ) : null}
              {meta ? (
                <YouTubeImportCard
                  title={meta.title}
                  channelName={meta.channelName}
                  thumbnailUrl={meta.thumbnailUrl}
                  durationLabel={publicDurationLabel(meta.durationMs)}
                  sourceUrl={meta.originalUrl}
                  outcome={importOutcome({
                    acquisitionState: job?.acquisitionState ?? meta.acquisitionState,
                    errorCode: job?.errorCode ?? meta.reasonCode,
                    state: job?.state,
                    assetId: job?.assetId,
                  })}
                  importing={importing}
                  downloading={downloading}
                  onDownload={() => void downloadAudio()}
                  onChooseFile={() => void openSession(true)}
                />
              ) : null}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
