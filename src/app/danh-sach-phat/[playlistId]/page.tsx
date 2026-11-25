"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clock } from "@/components/format";
import { AlertIcon, ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "@/components/icons";

type Item = { id: string; revisionId: string; note: string | null; position: number; durationMs: number };

type LibraryAsset = {
  originalFilename: string | null;
  revisions: Array<{ id: string; name: string | null; trimStartMs: number; trimEndMs: number }>;
};

type RevisionOption = { id: string; label: string; name: string; range: string };

export default function PlaylistDetailPage({ params }: { params: Promise<{ playlistId: string }> }) {
  const [playlistId, setPlaylistId] = useState("");
  const [name, setName] = useState("");
  const [version, setVersion] = useState(1);
  const [items, setItems] = useState<Item[] | null>(null);
  const [revisionId, setRevisionId] = useState("");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [options, setOptions] = useState<RevisionOption[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(id: string) {
    const response = await fetch(`/api/playlists/${id}`);
    if (response.status === 401) {
      window.location.href = "/dang-nhap";
      return;
    }
    if (!response.ok) {
      setLoadError(response.status === 404 ? "Không thấy danh sách phát này." : "Không tải được danh sách phát. Hãy thử tải lại trang.");
      return;
    }
    setLoadError("");
    const body = await response.json();
    setName(body.name);
    setVersion(body.version);
    setItems(body.items ?? []);
  }

  useEffect(() => {
    void params.then((value) => {
      setPlaylistId(value.playlistId);
      void load(value.playlistId);
    });
  }, [params]);

  useEffect(() => {
    void fetch("/api/library")
      .then(async (response) => {
        if (!response.ok) {
          setOptions([]);
          return;
        }
        const body = await response.json();
        const assets: LibraryAsset[] = body.items ?? [];
        const next = assets.flatMap((asset) =>
          asset.revisions.map((revision) => {
            const name = revision.name || asset.originalFilename || "Không tên";
            const range = `${clock(revision.trimStartMs, true)} → ${clock(revision.trimEndMs, true)}`;
            return { id: revision.id, label: `${name} · ${range}`, name, range };
          }),
        );
        setOptions(next);
        setRevisionId((current) => current || next[0]?.id || "");
      })
      .catch(() => setOptions([]));
  }, []);

  const byId = new Map((options ?? []).map((option) => [option.id, option]));
  const list = items ?? [];
  const total = list.reduce((sum, item) => sum + Number(item.durationMs), 0);

  async function send(payload: Record<string, unknown>, fallback: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/playlists/${playlistId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) setMessage(body.error?.message ?? fallback);
      else await load(playlistId);
    } catch {
      setMessage(fallback);
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= list.length) return;
    const order = list.map((entry) => entry.id);
    const [moved] = order.splice(index, 1);
    order.splice(target, 0, moved);
    void send({ action: "order", itemIds: order, version }, "Không đổi được thứ tự.");
  }

  return (
    <div className="wrap page">
      <Link href="/danh-sach-phat" className="back-link"><ArrowLeftIcon className="h-4 w-4" />Về danh sách phát</Link>
      <header className="page-head">
        <div className="min-w-0">
          <h1 className="page-title break-words">{name || "Danh sách"}</h1>
          <p className="page-lead tnum">
            {items === null ? (loadError ? "" : "Đang tải…") : `${list.length} bài · tổng ${clock(total)}`}
          </p>
        </div>
      </header>

      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] max-md:gap-8">
        <section aria-labelledby="items-title">
          <h2 id="items-title" className="sr-only">Thứ tự phát</h2>
          <div role="alert" className="empty:hidden mb-6">
            {message ? (
              <p className="notice notice-error">
                <AlertIcon />
                <span>{message}</span>
              </p>
            ) : null}
          </div>
          {loadError ? (
            <p className="notice notice-error" role="alert">
              <AlertIcon />
              <span>{loadError}</span>
            </p>
          ) : items === null ? (
            <div aria-busy="true">
              <span className="sr-only">Đang tải…</span>
              <ul className="rows" aria-hidden="true">
                {[0, 1, 2].map((key) => (
                  <li key={key} className="flex items-center gap-4 py-5">
                    <span className="skeleton h-6 w-6" />
                    <span className="skeleton h-6 flex-1" />
                  </li>
                ))}
              </ul>
            </div>
          ) : list.length === 0 ? (
            <div className="empty">
              <p className="empty-title">Danh sách chưa có bài nào.</p>
              <p className="max-w-measure text-muted">Chọn một bản chỉnh trong thư viện của bạn để thêm vào danh sách.</p>
            </div>
          ) : (
            <ol className="rows">
              {list.map((item, index) => {
                const option = byId.get(item.revisionId);
                const label = option?.label ?? (options === null ? "Đang tải tên bài…" : "Bản chỉnh không còn trong thư viện");
                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
                    <span className="tnum w-6 shrink-0 font-serif text-h3 text-muted" aria-hidden="true">{index + 1}</span>
                    <span className="min-w-0 flex-1 basis-48">
                      <span className="block break-words font-medium">{option?.name ?? label}</span>
                      <span className="tnum block text-sm text-muted">
                        {option ? `Đoạn ${option.range} · ` : ""}
                        {clock(Number(item.durationMs))}
                        {item.note ? ` · ${item.note}` : ""}
                      </span>
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={busy || index === 0}
                        aria-label={`Lên: ${label}`}
                        title="Lên"
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUpIcon />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={busy || index === list.length - 1}
                        aria-label={`Xuống: ${label}`}
                        title="Xuống"
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDownIcon />
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        disabled={busy}
                        aria-label={`Gỡ khỏi danh sách: ${label}`}
                        title="Gỡ khỏi danh sách"
                        onClick={() => void send({ action: "remove-item", itemId: item.id, version }, "Không gỡ được bài.")}
                      >
                        <TrashIcon />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section aria-labelledby="add-title">
          <form
            className="panel flex flex-col gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              await send({ action: "add-item", revisionId, version }, "Không thêm được.");
            }}
          >
            <h2 id="add-title" className="font-serif text-h3">Thêm bài</h2>
            {options !== null && options.length === 0 ? (
              <p className="text-muted">
                Thư viện chưa có bản chỉnh nào. Mở một bài trong <Link className="link" href="/thu-vien">thư viện</Link>, chỉnh đoạn cần phát rồi lưu.
              </p>
            ) : (
              <div className="field">
                <label className="label" htmlFor="revision-select">Bản chỉnh</label>
                <select
                  id="revision-select"
                  className="select"
                  value={revisionId}
                  disabled={options === null}
                  onChange={(event) => setRevisionId(event.target.value)}
                >
                  {options === null ? <option value="">Đang tải…</option> : null}
                  {options?.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
                <p className="hint">Mỗi bản chỉnh là một đoạn đã cắt từ file trong thư viện.</p>
              </div>
            )}
            <button
              className="btn btn-primary self-start max-sm:w-full"
              type="submit"
              disabled={busy || !revisionId}
              aria-busy={busy}
            >
              <PlusIcon />
              Thêm vào danh sách
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
