"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { AlertIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, HeadphonesIcon } from "@/components/icons";
import { PlanNav } from "@/components/plan-nav";

type Check = { code: string; message: string; stageId: string; cueId?: string };
type Report = { state: string; version: number; checks: Check[] };

export default function ReadinessPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);
  const [report, setReport] = useState<Report | null>(null);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/plans/${planId}/readiness`);
    if (response.status === 401) {
      window.location.href = `/dang-nhap?next=/ke-hoach/${planId}/san-sang`;
      return;
    }
    if (!response.ok) {
      setLoadError(response.status === 404 ? "Không thấy kế hoạch này." : "Không tải được kết quả kiểm tra.");
      return;
    }
    setLoadError("");
    setReport(await response.json());
  }, [planId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm() {
    if (!report) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/plans/${planId}/readiness/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: report.version }),
      });
      const body = await response.json();
      setMessageOk(response.ok);
      if (response.ok) {
        setMessage("Kế hoạch đã được xác nhận sẵn sàng.");
      } else if (response.status === 409) {
        setMessage("Kế hoạch vừa được sửa ở nơi khác. Đã kiểm tra lại, hãy xem kết quả mới.");
      } else {
        setMessage(body.error?.message ?? "Chưa thể xác nhận.");
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  const blocked = report ? report.checks.length > 0 : true;

  return (
    <div className="wrap page">
      <header className="pb-8">
        <Link className="back-link" href={`/ke-hoach/${planId}`}><ArrowLeftIcon className="h-4 w-4" />Về trình tự lễ</Link>
        <h1 className="page-title">Kiểm tra sẵn sàng</h1>
        <p className="page-lead">Hệ thống kiểm tra bài, bản chỉnh và MP3 của từng phần cần nhạc. Nghe lại và xác nhận là phần của bạn.</p>
      </header>

      <PlanNav planId={planId} />

      <div className="mt-12 max-w-3xl max-md:mt-8">
        {loadError ? <p className="notice notice-error" role="alert"><AlertIcon />{loadError}</p> : null}

        {!report && !loadError ? (
          <div className="panel flex flex-col gap-4" aria-busy="true">
            <span className="sr-only">Đang kiểm tra…</span>
            <span className="skeleton h-12 w-12 rounded-full" />
            <span className="skeleton h-8 w-2/3" />
            <span className="skeleton h-5 w-full" />
            <span className="skeleton h-5 w-4/5" />
          </div>
        ) : null}

        {report ? (
          <>
            {report.state === "READY" ? (
              <section className="panel flex flex-col items-start gap-4" aria-labelledby="readiness-state">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ok-tint text-ok"><CheckIcon className="h-6 w-6" /></span>
                <h2 id="readiness-state" className="section-title">Kế hoạch đã sẵn sàng</h2>
                <p className="max-w-measure text-muted">Mọi mục đã đạt và bạn đã xác nhận nghe lại. Sửa kế hoạch sau lúc này thì cần xác nhận lại.</p>
                <Link className="btn btn-primary max-sm:w-full" href={`/ke-hoach/${planId}/ban-giao`}>
                  Tạo gói bàn giao<ArrowRightIcon />
                </Link>
              </section>
            ) : report.checks.length === 0 ? (
              <section className="panel flex flex-col items-start gap-4" aria-labelledby="readiness-state">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ok-tint text-ok"><HeadphonesIcon className="h-6 w-6" /></span>
                <h2 id="readiness-state" className="section-title">Hệ thống đã kiểm tra xong</h2>
                <p className="max-w-measure text-muted">Các mục hệ thống đã đạt. Bạn vẫn cần nghe lại toàn bộ các bản MP3 trong trình tự lễ, rồi xác nhận bên dưới.</p>
              </section>
            ) : (
              <section className="panel" aria-labelledby="readiness-state">
                <div className="flex flex-col items-start gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warn-tint text-warn"><AlertIcon className="h-6 w-6" /></span>
                  <h2 id="readiness-state" className="section-title">Còn <span className="tnum">{report.checks.length}</span> mục cần xử lý</h2>
                  <p className="max-w-measure text-muted">Xử lý các mục dưới đây trong trình tự lễ trước khi xác nhận.</p>
                </div>
                <ul className="rows mt-6">
                  {report.checks.map((check) => (
                    <li key={`${check.code}-${check.stageId}-${check.cueId ?? ""}`} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-4">
                      <AlertIcon className="mt-1 h-5 w-5 shrink-0 text-warn" />
                      <p className="min-w-0 flex-1 basis-48">{check.message}</p>
                      <Link className="link inline-flex min-h-[44px] items-center max-sm:ml-9" href={`/ke-hoach/${planId}#stage-${check.stageId}`}>Mở phần lễ</Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {report.state !== "READY" ? (
              <div className="mt-8 flex flex-col items-start gap-3">
                <button
                  className="btn btn-primary max-sm:w-full"
                  type="button"
                  disabled={busy || blocked}
                  aria-busy={busy}
                  aria-describedby={blocked ? "confirm-hint" : undefined}
                  onClick={() => void confirm()}
                >
                  {busy ? "Đang xác nhận…" : "Tôi đã nghe và xác nhận"}
                </button>
                {blocked ? (
                  <p id="confirm-hint" className="hint">Nút này mở khi không còn mục nào cần xử lý.</p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {message ? (
          messageOk
            ? <p className="notice notice-ok mt-6" role="status"><CheckIcon />{message}</p>
            : <p className="notice notice-warn mt-6" role="alert"><AlertIcon />{message}</p>
        ) : null}
      </div>
    </div>
  );
}
