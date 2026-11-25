"use client";

import { useEffect, useState } from "react";
import { megabytes, percent } from "@/components/format";
import { AlertIcon, TrashIcon, UserIcon } from "@/components/icons";

const roleLabels: Record<string, string> = { ADMIN: "Quản trị viên", USER: "Người dùng" };

export default function AccountPage() {
  const [user, setUser] = useState<{ displayName: string; email: string | null; role: string; version: number; storageUsedBytes: string; storageQuotaBytes: string } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch("/api/session").then(async (response) => {
      const body = await response.json();
      if (!body.user) window.location.href = "/dang-nhap?next=/tai-khoan";
      setUser(body.user);
    }).catch(() => setMessage("Không tải được tài khoản."));
  }, []);

  if (!user) {
    return (
      <div className="wrap page max-w-2xl">
        {message ? (
          <p className="notice notice-error" role="alert">
            <AlertIcon />
            <span>{message}</span>
          </p>
        ) : (
          <div aria-busy="true">
            <span className="sr-only">Đang tải tài khoản…</span>
            <span className="skeleton h-12 w-2/3" aria-hidden="true" />
            <span className="skeleton mt-4 h-5 w-1/2" aria-hidden="true" />
            <span className="skeleton mt-12 h-2 w-full" aria-hidden="true" />
          </div>
        )}
      </div>
    );
  }

  const used = percent(user.storageUsedBytes, user.storageQuotaBytes);
  const usage = `Đã dùng ${megabytes(user.storageUsedBytes)} trên ${megabytes(user.storageQuotaBytes)}`;

  return (
    <div className="wrap page">
      <header className="page-head">
        <div className="flex min-w-0 items-center gap-6 max-sm:flex-col max-sm:items-start max-sm:gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-champagne font-serif text-h2 text-wine" aria-hidden="true">
            {user.displayName.trim().charAt(0).toUpperCase() || <UserIcon className="h-7 w-7" />}
          </span>
          <div className="min-w-0">
            <h1 className="page-title break-words">{user.displayName}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-muted">
              <span className="break-all">{user.email || "Chưa có email hiển thị"}</span>
              <span className="chip">{roleLabels[user.role] ?? "Người dùng"}</span>
            </p>
          </div>
        </div>
      </header>

      <div className="flex max-w-2xl flex-col gap-12 max-md:gap-8">
        <section aria-labelledby="storage-title" className="flex flex-col gap-3">
          <h2 id="storage-title" className="font-serif text-h3">Dung lượng</h2>
          <p className="tnum">{usage}</p>
          <div
            className="meter"
            role="progressbar"
            aria-labelledby="storage-title"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(used)}
            aria-valuetext={usage}
          >
            <span style={{ width: `${Math.max(used, used > 0 ? 1 : 0)}%` }} />
          </div>
        </section>

        <section aria-labelledby="session-title" className="flex flex-col items-start gap-3 border-t border-line pt-8">
          <h2 id="session-title" className="font-serif text-h3">Phiên đăng nhập</h2>
          <p className="text-muted">Đăng xuất trên máy này. Dữ liệu của bạn vẫn được giữ.</p>
          <button className="btn btn-secondary max-sm:w-full" type="button" onClick={async () => {
            await fetch("/api/session/logout", { method: "POST" });
            window.location.href = "/";
          }}>Đăng xuất</button>
        </section>

        <section aria-labelledby="delete-title" className="flex flex-col items-start gap-3 border-t border-line pt-8">
          <h2 id="delete-title" className="font-serif text-h3 text-danger">Xoá tài khoản</h2>
          <p className="max-w-measure text-muted">
            Xoá tài khoản và toàn bộ dữ liệu riêng của bạn. Việc này không hoàn tác được.
          </p>
          <button className="btn btn-danger max-sm:w-full" type="button" disabled={busy} aria-busy={busy} onClick={async () => {
            if (!window.confirm("Xoá tài khoản và dữ liệu riêng?")) return;
            setBusy(true);
            setMessage("");
            try {
              const response = await fetch("/api/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true, version: user.version }) });
              if (response.ok) {
                window.location.href = "/";
                return;
              }
              setMessage("Chưa xoá được tài khoản. Hãy thử lại.");
            } catch {
              setMessage("Chưa xoá được tài khoản. Hãy thử lại.");
            }
            setBusy(false);
          }}>
            <TrashIcon />
            Xoá tài khoản
          </button>
          {message ? (
            <p className="notice notice-error" role="alert">
              <AlertIcon />
              <span>{message}</span>
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
