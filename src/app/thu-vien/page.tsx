"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ExportControl, type ExportJob } from "@/components/export-control";
import { clock, megabytes, percent } from "@/components/format";
import {
  AlertIcon,
  CheckIcon,
  ClockIcon,
  LinkIcon,
  NoteIcon,
  ScissorsIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/icons";

type Revision = {
  id: string;
  name: string | null;
  trimStartMs: number;
  trimEndMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  gainDb: number;
  createdAt: string;
  exports: ExportJob[];
};

type Asset = {
  id: string;
  originalFilename: string | null;
  sourceType: string;
  status: string;
  durationMs: number | null;
  mediaFormat: string | null;
  revisions: Revision[];
};

type Usage = { storageUsedBytes: string; storageQuotaBytes: string };

const sources: Record<string, { label: string; icon: ReactNode }> = {
  UPLOAD: { label: "Tải lên", icon: <UploadIcon /> },
  YOUTUBE: { label: "YouTube", icon: <LinkIcon /> },
  CATALOG: { label: "Mục lục", icon: <NoteIcon /> },
};

const statuses: Record<string, { label: string; className: string; icon: ReactNode }> = {
  READY: { label: "Sẵn sàng", className: "chip-ok", icon: <CheckIcon /> },
  PROCESSING: { label: "Đang xử lý", className: "chip-warn", icon: <ClockIcon /> },
  FAILED: { label: "Lỗi", className: "chip-danger", icon: <AlertIcon /> },
  PENDING: { label: "Chờ", className: "", icon: <ClockIcon /> },
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function formatGain(db: number) {
  return `${db > 0 ? "+" : ""}${db} dB`;
}

const skeletonRows = (
  <div aria-busy="true">
    <span className="sr-only">Đang tải…</span>
    <ul className="rows" aria-hidden="true">
      {[0, 1, 2].map((key) => (
        <li key={key} className="flex flex-col gap-3 py-6">
          <span className="skeleton h-6 w-2/3 max-w-sm" />
          <span className="skeleton h-5 w-1/2 max-w-xs" />
        </li>
      ))}
    </ul>
  </div>
);

export default function LibraryPage() {
  const [items, setItems] = useState<Asset[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [q, setQ] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (search: string, source: string) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (source) params.set("sourceType", source);
    try {
      const [library, used] = await Promise.all([fetch(`/api/library?${params}`), fetch("/api/library/usage")]);
      if (library.status === 401) {
        window.location.href = "/dang-nhap?next=/thu-vien";
        return;
      }
      if (!library.ok) {
        setItems(null);
        setMessage("Không tải được thư viện. Hãy thử tải lại trang.");
        return;
      }
      const body = await library.json();
      setMessage("");
      setItems(body.items ?? []);
      if (used.ok) setUsage(await used.json());
    } catch {
      setMessage("Không tải được thư viện.");
    }
  }, []);

  useEffect(() => {
    void load("", "");
  }, [load]);

  async function remove(asset: Asset) {
    if (!window.confirm(`Xoá "${asset.originalFilename || "bản nhạc"}" cùng mọi bản chỉnh và MP3 của nó?`)) return;
    setMessage("");
    const response = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
    if (response.ok) {
      await load(q, sourceType);
      return;
    }
    const body = await response.json();
    const plans: string[] = body.error?.details?.plans ?? [];
    setMessage(
      plans.length
        ? `Không xoá được vì đang được dùng trong: ${plans.join(", ")}. Hãy gỡ bài khỏi các mục này trước.`
        : body.error?.message ?? "Không xoá được.",
    );
  }

  async function removeRevision(revision: Revision) {
    const label = revision.name || `bản chỉnh lúc ${formatDate(revision.createdAt)}`;
    if (!window.confirm(`Xoá "${label}" cùng MP3 đã xuất của nó? File gốc vẫn được giữ.`)) return;
    setMessage("");
    try {
      const response = await fetch(`/api/revisions/${revision.id}`, { method: "DELETE" });
      if (response.ok) {
        await load(q, sourceType);
        return;
      }
      const body = await response.json().catch(() => ({}));
      const plans: string[] = body.error?.details?.plans ?? [];
      setMessage(
        plans.length
          ? `Không xoá được vì đang được dùng trong: ${plans.join(", ")}. Hãy gỡ bản chỉnh khỏi các mục này trước.`
          : body.error?.message ?? "Không xoá được bản chỉnh.",
      );
    } catch {
      setMessage("Không xoá được bản chỉnh. Kiểm tra kết nối rồi thử lại.");
    }
  }

  const usedPercent = usage ? percent(usage.storageUsedBytes, usage.storageQuotaBytes) : 0;
  const filtered = q !== "" || sourceType !== "";

  return (
    <div className="wrap page">
      <header className="page-head">
        <div className="min-w-0">
          <h1 className="page-title">Thư viện</h1>
          <p className="page-lead">File bạn đã tải, các bản chỉnh đã lưu và MP3 đã xuất. Chỉ mình bạn thấy.</p>
        </div>
        <Link href="/tai-len" className="btn btn-primary max-sm:w-full">
          <UploadIcon />
          Tải nhạc lên
        </Link>
      </header>

      {usage ? (
        <section aria-labelledby="storage-title" className="mb-12 max-w-md max-md:mb-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="storage-title" className="label">Dung lượng</h2>
            <p className="tnum text-sm text-muted">
              Đã dùng {megabytes(usage.storageUsedBytes)} trên {megabytes(usage.storageQuotaBytes)}
            </p>
          </div>
          <div
            className="meter mt-2"
            role="progressbar"
            aria-labelledby="storage-title"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(usedPercent)}
            aria-valuetext={`Đã dùng ${megabytes(usage.storageUsedBytes)} trên ${megabytes(usage.storageQuotaBytes)}`}
          >
            <span style={{ width: `${Math.max(usedPercent, usedPercent > 0 ? 1 : 0)}%` }} />
          </div>
        </section>
      ) : null}

      <form
        className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_200px_auto]"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          void load(q, sourceType);
        }}
      >
        <div className="field">
          <label className="label" htmlFor="library-q">Tìm theo tên tệp</label>
          <input
            id="library-q"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Ví dụ: loi-vao"
            className="input"
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="library-source">Nguồn</label>
          <select id="library-source" value={sourceType} onChange={(event) => setSourceType(event.target.value)} className="select">
            <option value="">Mọi nguồn</option>
            <option value="UPLOAD">Tải lên</option>
            <option value="YOUTUBE">YouTube</option>
            <option value="CATALOG">Mục lục</option>
          </select>
        </div>
        <button type="submit" className="btn btn-secondary min-h-[48px] max-sm:w-full">
          <SearchIcon />
          Tìm bài
        </button>
      </form>

      <div className="mt-8">
        {message ? (
          <p className="notice notice-error mb-6" role="alert">
            <AlertIcon />
            <span>{message}</span>
          </p>
        ) : null}

        {items === null && !message ? skeletonRows : null}

        {items?.length === 0 ? (
          <div className="empty">
            <p className="empty-title">{filtered ? "Không có file nào khớp." : "Thư viện còn trống."}</p>
            <p className="max-w-measure text-muted">
              {filtered
                ? "Thử tên khác hoặc chọn mọi nguồn."
                : "Tải một bản MP3 hoặc WAV để cắt đoạn, chỉnh âm lượng và xuất MP3 cho từng phần lễ."}
            </p>
            {filtered ? null : (
              <Link href="/tai-len" className="btn btn-secondary mt-2 max-sm:w-full">
                <UploadIcon />
                Tải nhạc lên
              </Link>
            )}
          </div>
        ) : null}

        {items && items.length > 0 ? (
          <ul className="rows">
            {items.map((item) => {
              const name = item.originalFilename || "Không tên";
              const source = sources[item.sourceType];
              const status = statuses[item.status] ?? statuses.PENDING;
              return (
                <li key={item.id} className="py-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="break-words font-serif text-h3">{name}</h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="chip">
                          {source?.icon}
                          {source?.label ?? "Khác"}
                        </span>
                        <span className={`chip ${status.className}`}>
                          {status.icon}
                          {status.label}
                        </span>
                        <span className="tnum text-sm text-muted">
                          {item.mediaFormat ?? "—"} · {clock(item.durationMs)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 max-sm:w-full">
                      {item.status === "READY" ? (
                        <Link className="btn btn-sm btn-secondary max-sm:flex-1" href={`/bien-tap/${item.id}`}>
                          <ScissorsIcon />
                          Mở trình sửa
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        aria-label={`Xoá ${name}`}
                        title={`Xoá ${name}`}
                        onClick={() => void remove(item)}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                  {item.revisions.length > 0 ? (
                    <details className="mt-4">
                      <summary className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 font-medium text-wine">
                        Bản chỉnh đã lưu
                        <span className="chip chip-accent tnum">{item.revisions.length}</span>
                      </summary>
                      <ol className="mt-2 flex flex-col gap-3">
                        {item.revisions.map((revision) => (
                          <li key={revision.id} className="rounded-md border border-line bg-paper p-4">
                            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                              <div className="min-w-0">
                                <p className="font-medium [overflow-wrap:anywhere]">{revision.name || `Bản chỉnh lúc ${formatDate(revision.createdAt)}`}</p>
                                <p className="tnum text-sm text-muted">
                                  {revision.name ? `${formatDate(revision.createdAt)} · ` : ""}Đoạn {clock(revision.trimStartMs, true)} → {clock(revision.trimEndMs, true)} · Âm lượng {formatGain(revision.gainDb)}
                                </p>
                              </div>
                              <div className="-mr-2 flex items-center gap-1">
                                <Link className="link inline-flex min-h-[44px] items-center" href={`/bien-tap/${item.id}?revisionId=${revision.id}`}>
                                  Mở lại
                                </Link>
                                <button
                                  type="button"
                                  className="icon-btn icon-btn-danger"
                                  aria-label={`Xoá ${revision.name || `bản chỉnh lúc ${formatDate(revision.createdAt)}`}`}
                                  title="Xoá bản chỉnh"
                                  onClick={() => void removeRevision(revision)}
                                >
                                  <TrashIcon />
                                </button>
                              </div>
                            </div>
                            <div className="mt-3">
                              <ExportControl revisionId={revision.id} initial={revision.exports[0] ?? null} />
                            </div>
                          </li>
                        ))}
                      </ol>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
