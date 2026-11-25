"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { megabytes } from "@/components/format";
import { AlertIcon, ArrowLeftIcon, CheckIcon, DownloadIcon, FileIcon, NoteIcon, PackageIcon } from "@/components/icons";
import { PlanNav } from "@/components/plan-nav";

type HandoffPackage = {
  id: string;
  planVersion: number;
  state: string;
  isOutdated: boolean;
  byteSize: number | null;
  createdAt: string;
};

const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

const contents = [
  { icon: NoteIcon, text: "Các file MP3 của những phần cần nhạc, theo thứ tự lễ" },
  { icon: FileIcon, text: "Hướng dẫn PDF cho người phát nhạc" },
  { icon: FileIcon, text: "Bảng CSV các điểm nhạc, thời lượng và cách phát" },
];

export default function HandoffPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);
  const [items, setItems] = useState<HandoffPackage[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [buildError, setBuildError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/plans/${planId}/handoff`);
    if (response.status === 401) {
      window.location.href = `/dang-nhap?next=/ke-hoach/${planId}/ban-giao`;
      return;
    }
    if (!response.ok) {
      setLoadError(response.status === 404 ? "Không thấy kế hoạch này." : "Không tải được danh sách gói.");
      return;
    }
    setLoadError("");
    setItems((await response.json()).items);
  }, [planId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function build() {
    setBusy(true);
    setMessage("");
    setBuildError("");
    try {
      const response = await fetch(`/api/plans/${planId}/handoff`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) {
        setBuildError(body.error?.message ?? "Chưa tạo được gói.");
        return;
      }
      setMessage("Gói bàn giao đã sẵn sàng để tải.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap page">
      <header className="pb-8">
        <Link className="back-link" href={`/ke-hoach/${planId}`}><ArrowLeftIcon className="h-4 w-4" />Về trình tự lễ</Link>
        <h1 className="page-title">Bàn giao</h1>
        <p className="page-lead">Gói ZIP chứa đúng phiên bản kế hoạch lúc tạo gói. Kế hoạch đổi sau đó thì gói được đánh dấu đã cũ.</p>
      </header>

      <PlanNav planId={planId} />

      <section aria-labelledby="build-title" className="panel mt-12 grid gap-8 max-md:mt-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="min-w-0">
          <h2 id="build-title" className="font-serif text-h3">Gói ZIP gồm</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {contents.map((item) => (
              <li key={item.text} className="flex items-start gap-3">
                <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-wine" />
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <button className="btn btn-primary max-sm:w-full" type="button" disabled={busy} aria-busy={busy} onClick={() => void build()}>
          <PackageIcon />
          {busy ? "Đang tạo gói…" : "Tạo gói ZIP"}
        </button>
      </section>

      <div className="mt-4 flex flex-col gap-3">
        {message ? <p className="notice notice-ok" role="status"><CheckIcon />{message}</p> : null}
        {buildError ? (
          <p className="notice notice-error" role="alert">
            <AlertIcon />
            <span>{buildError} <Link className="link" href={`/ke-hoach/${planId}/san-sang`}>Mở trang kiểm tra sẵn sàng</Link></span>
          </p>
        ) : null}
      </div>

      <section aria-labelledby="packages-title" className="mt-16 max-md:mt-12">
        <h2 id="packages-title" className="section-title">Các gói đã tạo</h2>
        <div className="mt-6">
          {loadError ? <p className="notice notice-error" role="alert"><AlertIcon />{loadError}</p> : null}
          {items === null && !loadError ? (
            <div className="rows" aria-busy="true">
              <span className="sr-only">Đang tải…</span>
              {[0, 1].map((key) => (
                <div key={key} className="flex items-center gap-4 py-6">
                  <span className="skeleton h-6 w-40" />
                  <span className="skeleton h-5 w-32" />
                  <span className="skeleton ml-auto h-9 w-28 rounded-full" />
                </div>
              ))}
            </div>
          ) : null}
          {items?.length === 0 ? (
            <div className="empty">
              <p className="empty-title">Chưa có gói nào.</p>
              <p className="max-w-measure text-muted">Gói chỉ tạo được khi kế hoạch đã qua kiểm tra và bạn đã xác nhận nghe lại.</p>
              <Link className="link inline-flex min-h-[44px] items-center" href={`/ke-hoach/${planId}/san-sang`}>Mở kiểm tra sẵn sàng</Link>
            </div>
          ) : null}
          {items?.length ? (
            <ul className="rows">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
                  <PackageIcon className="h-6 w-6 shrink-0 text-muted max-sm:hidden" />
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="tnum font-serif text-h3">Phiên bản {item.planVersion}</p>
                    <p className="tnum mt-1 text-sm text-muted">
                      {dateFormat.format(new Date(item.createdAt))}
                      {item.byteSize ? ` · ${megabytes(item.byteSize)}` : ""}
                    </p>
                  </div>
                  {item.isOutdated
                    ? <span className="chip chip-warn"><AlertIcon />Đã cũ, kế hoạch đã đổi sau gói này</span>
                    : <span className="chip chip-ok"><CheckIcon />Đúng phiên bản hiện tại</span>}
                  {item.state === "COMPLETED" ? (
                    <a className="btn btn-secondary btn-sm max-sm:w-full" href={`/api/plans/${planId}/handoff/${item.id}/file`} aria-label={`Tải ZIP phiên bản ${item.planVersion}`}>
                      <DownloadIcon />Tải ZIP
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  );
}
