"use client";

import { useState } from "react";
import { safeNextPath } from "@/server/auth/redirect";
import { AlertIcon, InfoIcon } from "@/components/icons";

export function SignInForm() {
  const [subject, setSubject] = useState("khach-a");
  const [displayName, setDisplayName] = useState("Khách thử");
  const [message, setMessage] = useState("");
  return (
    <form
      className="mt-4 flex flex-col gap-4 border-t border-line pt-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const response = await fetch("/api/session/test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subject, displayName }),
        });
        if (!response.ok) {
          setMessage("Không tạo được phiên kiểm thử.");
          return;
        }
        window.location.href = safeNextPath(new URLSearchParams(window.location.search).get("next"));
      }}
    >
      <div>
        <h2 className="font-serif text-h3">Phiên kiểm thử cục bộ</h2>
        <p className="notice notice-warn mt-3">
          <InfoIcon />
          <span>Chỉ hiện khi máy phát triển bật chế độ thử. Đây không phải tài khoản Google.</span>
        </p>
      </div>
      <div className="field">
        <label className="label" htmlFor="test-subject">Mã định danh</label>
        <input id="test-subject" value={subject} onChange={(event) => setSubject(event.target.value)} className="input" />
      </div>
      <div className="field">
        <label className="label" htmlFor="test-name">Tên hiển thị</label>
        <input id="test-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="input" />
      </div>
      <button className="btn btn-secondary w-full" type="submit">Vào với phiên thử</button>
      {message ? (
        <p className="notice notice-error" role="alert">
          <AlertIcon />
          <span>{message}</span>
        </p>
      ) : null}
    </form>
  );
}
