"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertIcon, ArrowRightIcon, CheckIcon } from "@/components/icons";

type Failure = { id: string; kind: string; errorCode: string | null; updatedAt?: string };

const kindLabels: Record<string, string> = { UPLOAD: "Tải lên", YOUTUBE: "Nhập YouTube", EXPORT: "Xuất MP3" };

export default function AdminPage() {
  const [failures, setFailures] = useState<Failure[] | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void fetch("/api/admin/failures").then(async (response) => {
      if (response.status === 403 || response.status === 401) {
        setMessage("Chỉ quản trị viên xem được trang này.");
        return;
      }
      if (!response.ok) {
        setMessage("Không tải được danh sách việc lỗi.");
        return;
      }
      const body = await response.json();
      setFailures(body.items ?? []);
    }).catch(() => setMessage("Không tải được danh sách việc lỗi."));
  }, []);
  return (
    <div className="wrap page">
      <header className="page-head">
        <div className="min-w-0">
          <h1 className="page-title">Quản trị</h1>
          <p className="page-lead">Theo dõi việc xử lý bị lỗi và quản lý danh mục nhạc dùng chung.</p>
        </div>
      </header>

      <div className="flex flex-col gap-12 max-md:gap-8">
        <nav aria-label="Mục quản trị">
          <ul className="rows">
            <li>
              <Link href="/quan-tri/danh-muc" className="row-link group flex items-center gap-4 px-2 py-5">
                <span className="min-w-0 flex-1">
                  <span className="block font-serif text-h3 group-hover:underline">Danh mục nhạc</span>
                  <span className="mt-1 block text-muted">Thêm bản nháp bài hát cho trang khám phá.</span>
                </span>
                <ArrowRightIcon className="h-5 w-5 shrink-0 text-wine" />
              </Link>
            </li>
          </ul>
        </nav>

        {message ? (
          <p className="notice notice-warn max-w-2xl" role="alert">
            <AlertIcon />
            <span>{message}</span>
          </p>
        ) : (
          <section aria-labelledby="failures-title">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="failures-title" className="section-title">Việc lỗi gần đây</h2>
              {failures && failures.length > 0 ? <p className="tnum text-sm text-muted">{failures.length} việc</p> : null}
            </div>
            <div className="mt-6">
              {failures === null ? (
                <div aria-busy="true">
                  <span className="sr-only">Đang tải…</span>
                  <ul className="rows" aria-hidden="true">
                    {[0, 1, 2].map((key) => (
                      <li key={key} className="py-4"><span className="skeleton h-6 w-2/3" /></li>
                    ))}
                  </ul>
                </div>
              ) : failures.length === 0 ? (
                <div className="empty">
                  <p className="empty-title flex items-center gap-3">
                    <CheckIcon className="h-6 w-6 text-ok" />
                    Không có việc lỗi
                  </p>
                  <p className="text-muted">Chưa có lượt tải lên, nhập hay xuất nào bị lỗi.</p>
                </div>
              ) : (
                <>
                  <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,2fr)_160px] gap-4 px-2 pb-2 md:grid" aria-hidden="true">
                    <span className="label">Loại việc</span>
                    <span className="label">Mã lỗi</span>
                    <span className="label text-right">Cập nhật</span>
                  </div>
                  <ul className="rows">
                    {failures.map((item) => (
                      <li key={item.id} className="grid gap-2 px-2 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_160px] md:items-center md:gap-4">
                        <span className="font-medium">{kindLabels[item.kind] ?? item.kind}</span>
                        <span className="min-w-0">
                          <code className="chip chip-danger max-w-full overflow-hidden text-ellipsis font-mono">{item.errorCode ?? "Không có mã"}</code>
                        </span>
                        <span className="tnum text-sm text-muted md:text-right">
                          {item.updatedAt ? new Date(item.updatedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
