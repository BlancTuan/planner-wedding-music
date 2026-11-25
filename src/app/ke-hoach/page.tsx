"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertIcon, TrashIcon } from "@/components/icons";
import { PlanStateChip, weddingDateLabel } from "@/components/plan-nav";

type PlanItem = { id: string; name: string; state: string; version?: number; weddingDate?: string | null; location?: string | null };
type Template = "VIETNAMESE_SUGGESTED" | "EMPTY";

export default function PlansPage() {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState<Template | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/plans");
      if (response.status === 401) {
        window.location.href = "/dang-nhap?next=/ke-hoach";
        return;
      }
      if (!response.ok) {
        setLoadError("Không tải được danh sách kế hoạch. Hãy tải lại trang.");
        return;
      }
      const body = await response.json();
      setItems(body.items ?? []);
    } catch {
      setLoadError("Không tải được danh sách kế hoạch. Hãy tải lại trang.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(item: PlanItem) {
    if (item.version === undefined) return;
    if (!window.confirm(`Xoá kế hoạch "${item.name}"? Thao tác này không hoàn tác được.`)) return;
    setDeletingId(item.id);
    setDeleteError("");
    try {
      const response = await fetch(`/api/plans/${item.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true, version: item.version }),
      });
      if (response.status === 401) {
        window.location.href = "/dang-nhap?next=/ke-hoach";
        return;
      }
      if (response.ok) {
        setItems((current) => (current ?? []).filter((plan) => plan.id !== item.id));
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (response.status === 409) {
        setDeleteError("Kế hoạch vừa được sửa ở nơi khác. Đã tải lại danh sách, hãy thử xoá lại.");
        await load();
      } else {
        setDeleteError(body.error?.message ?? "Không xoá được kế hoạch.");
      }
    } catch {
      setDeleteError("Không xoá được kế hoạch. Kiểm tra kết nối rồi thử lại.");
    } finally {
      setDeletingId(null);
    }
  }

  async function create(template: Template) {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Cần nhập tên kế hoạch.");
      return;
    }
    setNameError("");
    setCreating(template);
    setCreateError("");
    try {
      const response = await fetch("/api/plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: trimmed, template }) });
      if (response.status === 401) {
        window.location.href = "/dang-nhap?next=/ke-hoach";
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        setItems((current) => [{ id: body.id, name: body.name, state: body.state, version: body.version }, ...(current ?? [])]);
      } else {
        setCreateError(body.error?.message ?? "Không tạo được kế hoạch.");
      }
    } catch {
      setCreateError("Không tạo được kế hoạch. Kiểm tra kết nối rồi thử lại.");
    } finally {
      setCreating(null);
    }
  }

  return (
    <div className="wrap page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Kế hoạch lễ</h1>
          <p className="page-lead">Mỗi kế hoạch là trình tự một buổi lễ: từng phần, bài nhạc của phần đó và người phát.</p>
        </div>
      </header>

      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_380px] max-md:gap-8">
        <section aria-labelledby="create-title" className="panel lg:order-2">
          <h2 id="create-title" className="font-serif text-h3">Tạo kế hoạch mới</h2>
          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void create("VIETNAMESE_SUGGESTED");
            }}
          >
            <div className="field">
              <label className="label" htmlFor="plan-name">Tên kế hoạch</label>
              <input
                id="plan-name"
                className="input"
                maxLength={160}
                value={name}
                placeholder="Ví dụ: Lễ nhà"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "plan-name-error" : undefined}
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError("");
                }}
              />
              {nameError ? <p id="plan-name-error" className="text-sm text-danger" role="alert">{nameError}</p> : null}
            </div>
            <p className="hint">Bản gợi ý có sẵn 11 phần của lễ cưới Việt, từ đón khách đến tiễn khách. Bạn sửa được mọi phần.</p>
            <div className="flex flex-wrap gap-3 max-sm:flex-col">
              <button className="btn btn-primary max-sm:w-full" type="submit" disabled={creating !== null} aria-busy={creating === "VIETNAMESE_SUGGESTED"}>
                {creating === "VIETNAMESE_SUGGESTED" ? "Đang tạo…" : "Tạo từ gợi ý"}
              </button>
              <button className="btn btn-secondary max-sm:w-full" type="button" disabled={creating !== null} aria-busy={creating === "EMPTY"} onClick={() => void create("EMPTY")}>
                {creating === "EMPTY" ? "Đang tạo…" : "Tạo trống"}
              </button>
            </div>
            {createError ? (
              <p className="notice notice-error" role="alert"><AlertIcon />{createError}</p>
            ) : null}
          </form>
        </section>

        <section aria-labelledby="list-title" className="min-w-0 lg:order-1">
          <h2 id="list-title" className="sr-only">Các kế hoạch của bạn</h2>
          {loadError ? (
            <p className="notice notice-error" role="alert"><AlertIcon />{loadError}</p>
          ) : items === null ? (
            <div className="rows" aria-busy="true">
              <span className="sr-only">Đang tải…</span>
              {[0, 1, 2].map((key) => (
                <div key={key} className="flex items-center gap-4 py-6">
                  <span className="skeleton h-6 w-1/2" />
                  <span className="skeleton ml-auto h-7 w-24 rounded-full" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="empty">
              <p className="empty-title">Bạn chưa có kế hoạch lễ nào.</p>
              <p className="max-w-measure text-muted">Kế hoạch giữ thứ tự các phần lễ và bài nhạc cho từng phần, để người phát nhạc làm đúng trong ngày cưới.</p>
              <button className="btn btn-secondary max-sm:w-full" type="button" disabled={creating !== null} onClick={() => void create("VIETNAMESE_SUGGESTED")}>
                Tạo kế hoạch từ gợi ý
              </button>
            </div>
          ) : (
            <>
              {deleteError ? (
                <p className="notice notice-error mb-4" role="alert"><AlertIcon />{deleteError}</p>
              ) : null}
              <ul className="rows">
                {items.map((item) => {
                  const date = weddingDateLabel(item.weddingDate);
                  const meta = [date, item.location].filter(Boolean).join(" · ");
                  return (
                    <li key={item.id} className="flex items-center gap-2">
                      <Link className="row-link group flex min-w-0 flex-1 items-center gap-4 px-4 py-4 max-md:px-0" href={`/ke-hoach/${item.id}`}>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words font-serif text-h3 group-hover:underline">{item.name}</span>
                          {meta ? <span className="mt-1 block text-sm text-muted">{meta}</span> : null}
                        </span>
                        <PlanStateChip state={item.state} />
                      </Link>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger shrink-0"
                        aria-label={`Xoá kế hoạch ${item.name}`}
                        disabled={deletingId !== null || item.version === undefined}
                        aria-busy={deletingId === item.id}
                        onClick={() => void remove(item)}
                      >
                        <TrashIcon />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
