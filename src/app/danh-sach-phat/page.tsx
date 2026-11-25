"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clock } from "@/components/format";
import { AlertIcon, PlusIcon, TrashIcon } from "@/components/icons";

type Playlist = { id: string; name: string; description?: string | null; durationMs?: string | number | null };

export default function PlaylistsPage() {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [items, setItems] = useState<Playlist[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function remove(item: Playlist) {
    if (!window.confirm(`Xoá danh sách "${item.name}"? Thao tác này không hoàn tác được. File nhạc trong thư viện vẫn còn.`)) return;
    setDeletingId(item.id);
    setMessage("");
    try {
      const response = await fetch(`/api/playlists/${item.id}`, { method: "DELETE" });
      if (response.status === 401) {
        window.location.href = "/dang-nhap?next=/danh-sach-phat";
        return;
      }
      if (response.ok) {
        setItems((current) => (current ?? []).filter((playlist) => playlist.id !== item.id));
        return;
      }
      const body = await response.json().catch(() => ({}));
      setMessage(body.error?.message ?? "Không xoá được danh sách.");
    } catch {
      setMessage("Không xoá được danh sách. Kiểm tra kết nối rồi thử lại.");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    void fetch("/api/playlists")
      .then(async (response) => {
        if (response.status === 401) window.location.href = "/dang-nhap?next=/danh-sach-phat";
        const body = await response.json();
        if (!response.ok) {
          setMessage(body.error?.message ?? "Không tải được danh sách phát.");
          setItems([]);
          return;
        }
        setItems(body.items ?? []);
      })
      .catch(() => {
        setMessage("Không tải được danh sách phát.");
        setItems([]);
      });
  }, []);

  return (
    <div className="wrap page">
      <header className="page-head">
        <div className="min-w-0">
          <h1 className="page-title">Danh sách phát</h1>
          <p className="page-lead">
            Gom các bản chỉnh theo thứ tự sẽ phát, rồi gán cả danh sách vào một phần lễ trong kế hoạch.
          </p>
        </div>
      </header>

      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] max-md:gap-8">
        <section aria-labelledby="list-title" className="order-2 lg:order-1">
          <h2 id="list-title" className="sr-only">Danh sách của bạn</h2>
          {message ? (
            <p className="notice notice-error mb-6" role="alert">
              <AlertIcon />
              <span>{message}</span>
            </p>
          ) : null}
          {items === null ? (
            <div aria-busy="true">
              <span className="sr-only">Đang tải…</span>
              <ul className="rows" aria-hidden="true">
                {[0, 1, 2].map((key) => (
                  <li key={key} className="flex flex-col gap-2 py-5">
                    <span className="skeleton h-6 w-1/2 max-w-xs" />
                    <span className="skeleton h-4 w-24" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {items?.length === 0 && !message ? (
            <div className="empty">
              <p className="empty-title">Bạn chưa có danh sách phát nào.</p>
              <p className="max-w-measure text-muted">
                Một danh sách giữ nhiều bài cho một phần lễ dài, như lúc đón khách hay tiệc. Đặt tên ở khung bên cạnh để bắt đầu.
              </p>
            </div>
          ) : null}
          {items && items.length > 0 ? (
            <ul className="rows">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-2">
                  <Link className="row-link group flex min-w-0 flex-1 items-center gap-4 px-2 py-5" href={`/danh-sach-phat/${item.id}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-serif text-h3 group-hover:underline">{item.name}</span>
                      {item.description ? <span className="mt-1 block text-muted">{item.description}</span> : null}
                    </span>
                    {item.durationMs !== undefined && item.durationMs !== null ? (
                      <span className="tnum shrink-0 text-sm text-muted">{clock(Number(item.durationMs))}</span>
                    ) : null}
                  </Link>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger shrink-0"
                    aria-label={`Xoá danh sách ${item.name}`}
                    disabled={deletingId !== null}
                    aria-busy={deletingId === item.id}
                    onClick={() => void remove(item)}
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section aria-labelledby="create-title" className="order-1 lg:order-2">
          <form
            className="panel flex flex-col gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const trimmed = name.trim();
              if (!trimmed) {
                setNameError("Cần nhập tên danh sách.");
                return;
              }
              setNameError("");
              setBusy(true);
              setMessage("");
              try {
                const response = await fetch("/api/playlists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: trimmed }) });
                const body = await response.json();
                if (response.ok) setItems((current) => [body, ...(current ?? [])]);
                else setMessage(body.error?.message ?? "Không tạo được danh sách.");
              } catch {
                setMessage("Không tạo được danh sách.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2 id="create-title" className="font-serif text-h3">Tạo danh sách mới</h2>
            <div className="field">
              <label className="label" htmlFor="playlist-name">Tên danh sách</label>
              <input
                id="playlist-name"
                className="input"
                maxLength={160}
                value={name}
                placeholder="Ví dụ: Danh sách lễ"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "playlist-name-error" : undefined}
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError("");
                }}
              />
              {nameError ? <p id="playlist-name-error" className="text-sm text-danger" role="alert">{nameError}</p> : null}
            </div>
            <button className="btn btn-primary self-start max-sm:w-full" type="submit" disabled={busy} aria-busy={busy}>
              <PlusIcon />
              {busy ? "Đang tạo…" : "Tạo danh sách"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
