"use client";

import { useEffect, useRef, useState } from "react";
import { newIdempotencyKey } from "@/components/idempotency-key";
import { AlertIcon, CheckIcon, ClockIcon, DownloadIcon, ResetIcon } from "@/components/icons";

export type ExportJob = {
  id: string;
  state: string;
  errorCode: string | null;
  durationMs: number | null;
  progress?: number;
};

const ACTIVE = new Set(["QUEUED", "PROCESSING", "VERIFYING"]);

const stateLabels: Record<string, string> = {
  QUEUED: "Đang chờ xuất",
  PROCESSING: "Đang xuất MP3",
  VERIFYING: "Đang kiểm tra MP3",
  COMPLETED: "MP3 đã sẵn sàng",
  FAILED: "Xuất MP3 thất bại",
  CANCELLED: "Đã huỷ xuất",
};

const errorLabels: Record<string, string> = {
  RENDER_FAILED: "Không dựng được tệp MP3.",
  VERIFY_FAILED: "Tệp MP3 không khớp độ dài đã chọn.",
  STALE_JOB: "Việc xuất bị treo quá lâu và đã dừng.",
  QUOTA_EXCEEDED: "Bản MP3 vượt quá dung lượng còn lại.",
};

export function ExportControl({
  revisionId,
  initial,
  onCompleted,
  tone = "light",
}: {
  revisionId: string;
  initial: ExportJob | null;
  onCompleted?: () => void;
  tone?: "light" | "studio";
}) {
  const [job, setJob] = useState<ExportJob | null>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const keyRef = useRef<string | null>(null);
  const completedRef = useRef(onCompleted);
  const jobId = job?.id;
  const active = job ? ACTIVE.has(job.state) : false;
  const completedNow = job?.state === "COMPLETED" && initial?.state !== "COMPLETED";

  useEffect(() => {
    completedRef.current = onCompleted;
  }, [onCompleted]);

  useEffect(() => {
    if (completedNow) completedRef.current?.();
  }, [completedNow, jobId]);

  useEffect(() => {
    if (!jobId || !active) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/exports/${jobId}`);
      if (response.ok) setJob(await response.json());
    }, 1500);
    return () => window.clearInterval(timer);
  }, [jobId, active]);

  async function send(url: string, init: RequestInit, fallback: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, init);
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error?.message ?? fallback);
        return;
      }
      setJob(body);
      keyRef.current = null;
    } catch {
      setMessage(fallback);
    } finally {
      setBusy(false);
    }
  }

  function startExport() {
    keyRef.current ??= newIdempotencyKey();
    void send(
      `/api/revisions/${revisionId}/exports`,
      { method: "POST", headers: { "idempotency-key": keyRef.current } },
      "Không bắt đầu xuất được.",
    );
  }

  const studio = tone === "studio";
  const primary = studio ? "studio-btn border-studio-accent text-studio-accent" : "btn btn-sm btn-secondary";
  const secondary = studio ? "studio-btn" : "btn btn-sm btn-secondary";
  const progress = active && typeof job?.progress === "number" ? job.progress : null;
  const chip = !job
    ? null
    : job.state === "COMPLETED"
      ? { className: "chip-ok", icon: <CheckIcon /> }
      : job.state === "FAILED"
        ? { className: "chip-danger", icon: <AlertIcon /> }
        : active
          ? { className: "chip-warn", icon: <ClockIcon /> }
          : { className: "", icon: null };

  return (
    <div className="flex flex-wrap items-center gap-3">
    <div className="contents" aria-live="polite">
      {job && chip ? (
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={`chip ${chip.className}`}>
            {chip.icon}
            {stateLabels[job.state] ?? job.state}
            {progress !== null ? <span className="tnum"> · {progress}%</span> : null}
          </span>
          {job.state === "FAILED" && job.errorCode ? (
            <span className={studio ? "text-sm text-studio-muted" : "text-sm text-danger"}>{errorLabels[job.errorCode] ?? job.errorCode}</span>
          ) : null}
        </span>
      ) : null}
      {progress !== null ? (
        <span className={`h-1.5 w-24 overflow-hidden rounded-full ${studio ? "bg-studio-raised" : "bg-champagne"}`} aria-hidden="true">
          <span className={`block h-full ${studio ? "bg-studio-accent" : "bg-wine"}`} style={{ width: `${progress}%` }} />
        </span>
      ) : null}
      {!job || job.state === "CANCELLED" ? (
        <button type="button" disabled={busy} aria-busy={busy} className={primary} onClick={startExport}>
          <DownloadIcon />
          {busy ? "Đang gửi…" : "Xuất MP3"}
        </button>
      ) : null}
      {active ? (
        <button
          type="button"
          disabled={busy}
          className={secondary}
          onClick={() => void send(`/api/exports/${job!.id}/cancel`, { method: "POST" }, "Không huỷ được.")}
        >
          Huỷ xuất
        </button>
      ) : null}
      {job?.state === "FAILED" ? (
        <button
          type="button"
          disabled={busy}
          className={secondary}
          onClick={() => void send(`/api/exports/${job.id}/retry`, { method: "POST" }, "Không thử lại được.")}
        >
          <ResetIcon />
          Thử lại
        </button>
      ) : null}
      {job?.state === "COMPLETED" ? (
        <a className={primary} href={`/api/exports/${job.id}/file`} download>
          <DownloadIcon />
          Tải MP3
        </a>
      ) : null}
    </div>
      {message ? (
        <span role="alert" className={studio ? "text-sm text-studio-accent" : "text-sm text-danger"}>{message}</span>
      ) : null}
    </div>
  );
}
