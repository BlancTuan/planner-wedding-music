"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { clock } from "@/components/format";
import { AlertIcon, ArrowLeftIcon, CheckIcon, HeadphonesIcon, InfoIcon, PlusIcon, UploadIcon } from "@/components/icons";

type AdminTrack = {
  id: string;
  title: string;
  artist: string;
  vocalType: string;
  usagePermission: string;
  publishState: string;
  version: number;
  durationMs: number | null;
  hasAudio: boolean;
};

type Category = { id: string; kind: string; nameVi: string };
type Notice = { ok: boolean; text: string } | null;
type Permission = "PREVIEW_ALLOWED" | "METADATA_ONLY" | "RESTRICTED";
type Vocal = "VOCAL" | "INSTRUMENTAL" | "MIXED";

const MAX_BYTES = 100 * 1024 * 1024;

const vocalLabels: Record<string, string> = { VOCAL: "Có lời", INSTRUMENTAL: "Không lời", MIXED: "Kết hợp" };
const permissionLabels: Record<string, string> = {
  PREVIEW_ALLOWED: "Cho nghe thử",
  METADATA_ONLY: "Chỉ thông tin",
  RESTRICTED: "Hạn chế",
};
const stateLabels: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Nháp", className: "" },
  PUBLISHED: { label: "Đã đăng", className: "chip-ok" },
  UNPUBLISHED: { label: "Đã gỡ", className: "chip-warn" },
};

class StepError extends Error {}

async function call(url: string, init: RequestInit, fallback: string) {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new StepError("Không kết nối được. Kiểm tra mạng rồi thử lại.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new StepError(response.status === 409 ? "Bài vừa được sửa ở nơi khác. Đã tải lại danh sách." : body.error?.message ?? fallback);
  }
  return body;
}

function fileProblem(file: File): string {
  if (!/\.(mp3|wav)$/i.test(file.name)) return "Chỉ nhận file MP3 hoặc WAV.";
  if (file.size > MAX_BYTES) return "File vượt quá 100 MB.";
  return "";
}

function uploadBody(trackId: string, file: File) {
  const form = new FormData();
  form.set("trackId", trackId);
  form.set("file", file);
  return form;
}

function TrackRow({
  track,
  busy,
  onUpload,
  onPublish,
}: {
  track: AdminTrack;
  busy: boolean;
  onUpload: (track: AdminTrack, file: File) => void;
  onPublish: (track: AdminTrack, publish: boolean) => void;
}) {
  const state = stateLabels[track.publishState] ?? { label: track.publishState, className: "" };
  const published = track.publishState === "PUBLISHED";
  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="min-w-0">
        <p className="break-words font-serif text-h3">{track.title}</p>
        <p className="break-words text-sm text-muted">{track.artist} · {vocalLabels[track.vocalType] ?? track.vocalType}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`chip ${state.className}`}>{state.label}</span>
        <span className="chip">{permissionLabels[track.usagePermission] ?? track.usagePermission}</span>
        {track.hasAudio ? (
          <span className="chip chip-ok tnum"><HeadphonesIcon />Có file · {clock(track.durationMs)}</span>
        ) : (
          <span className="chip chip-warn"><InfoIcon />Chưa có file</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label
          className={`btn btn-secondary btn-sm cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-wine max-sm:w-full ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <UploadIcon />
          {track.hasAudio ? "Thay file" : "Tải file lên"}
          <input
            className="sr-only"
            type="file"
            accept=".mp3,.wav,audio/mpeg,audio/wav"
            disabled={busy}
            aria-label={`${track.hasAudio ? "Thay file" : "Tải file lên"} cho ${track.title}`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(track, file);
              event.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          className={`btn btn-sm max-sm:w-full ${published ? "btn-secondary" : "btn-primary"}`}
          disabled={busy}
          aria-busy={busy}
          onClick={() => onPublish(track, !published)}
        >
          {published ? "Gỡ khỏi Khám phá" : "Đăng lên Khám phá"}
        </button>
        {published ? (
          <Link className="link inline-flex min-h-[44px] items-center" href={`/bai-hat/${track.id}`}>Xem trên Khám phá</Link>
        ) : null}
      </div>
    </li>
  );
}

export default function AdminCatalogPage() {
  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [vocalType, setVocalType] = useState<Vocal>("INSTRUMENTAL");
  const [permission, setPermission] = useState<Permission>("PREVIEW_ALLOWED");
  const [sourceNote, setSourceNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [styleId, setStyleId] = useState("");
  const [moodId, setMoodId] = useState("");
  const [languageId, setLanguageId] = useState("");
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [publishNow, setPublishNow] = useState(true);
  const [errors, setErrors] = useState({ title: "", artist: "", file: "" });
  const [step, setStep] = useState("");
  const [result, setResult] = useState<Notice>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tracks, setTracks] = useState<AdminTrack[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowResult, setRowResult] = useState<Notice>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/tracks");
      if (response.status === 401 || response.status === 403) {
        setLoadError("Chỉ quản trị viên xem được trang này.");
        return;
      }
      if (!response.ok) {
        setLoadError("Không tải được danh sách nhạc.");
        return;
      }
      setLoadError("");
      setTracks((await response.json()).items ?? []);
    } catch {
      setLoadError("Không tải được danh sách nhạc.");
    }
  }, []);

  useEffect(() => {
    void load();
    void fetch("/api/catalog/categories")
      .then(async (response) => {
        if (response.ok) setCategories((await response.json()).items ?? []);
      })
      .catch(() => undefined);
  }, [load]);

  const byKind = (kind: string) => categories.filter((category) => category.kind === kind);
  const submitting = step !== "";

  function validate() {
    const next = {
      title: title.trim() ? "" : "Cần nhập tên bài.",
      artist: artistName.trim() ? "" : "Cần nhập tên nghệ sĩ.",
      file: file ? fileProblem(file) : permission === "PREVIEW_ALLOWED" ? "Cần chọn file nhạc để cho nghe thử, hoặc đổi sang Chỉ thông tin." : "",
    };
    setErrors(next);
    return !next.title && !next.artist && !next.file;
  }

  function resetForm() {
    setTitle("");
    setArtistName("");
    setSourceNote("");
    setFile(null);
    setFileKey((key) => key + 1);
    setStyleId("");
    setMoodId("");
    setLanguageId("");
    setStageIds([]);
    setErrors({ title: "", artist: "", file: "" });
  }

  async function submit() {
    if (!validate()) return;
    const name = title.trim();
    let createdId: string | null = null;
    setResult(null);
    try {
      setStep("Đang tạo bài…");
      const created = await call(
        "/api/admin/tracks",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "create",
            title: name,
            artistName: artistName.trim(),
            vocalType,
            usagePermission: permission,
            sourceNote: sourceNote.trim() || null,
            styleId: styleId || undefined,
            moodId: moodId || undefined,
            languageId: languageId || undefined,
            stageIds,
          }),
        },
        "Không tạo được bài.",
      );
      createdId = created.id;
      let version: number = created.version;
      const keptFile = file;
      const shouldPublish = publishNow;
      resetForm();
      if (keptFile) {
        setStep("Đang tải file lên…");
        const attached = await call("/api/admin/tracks", { method: "POST", body: uploadBody(created.id, keptFile) }, "Không tải được file lên.");
        version = attached.version;
      }
      if (shouldPublish) {
        setStep("Đang đăng lên Khám phá…");
        await call(
          "/api/admin/tracks",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "publish", trackId: created.id, version }),
          },
          "Không đăng được bài.",
        );
      }
      setResult({
        ok: true,
        text: shouldPublish ? `Đã đăng “${name}” lên Khám phá.` : `Đã lưu “${name}” ở dạng nháp.`,
      });
    } catch (error) {
      const text = error instanceof StepError ? error.message : "Không thực hiện được.";
      setResult({
        ok: false,
        text: createdId ? `${text} Bài đã được lưu ở dạng nháp, hãy xử lý tiếp trong danh sách bên dưới.` : text,
      });
    } finally {
      setStep("");
      await load();
    }
  }

  async function uploadFor(track: AdminTrack, picked: File) {
    const problem = fileProblem(picked);
    if (problem) {
      setRowResult({ ok: false, text: `${track.title}: ${problem}` });
      return;
    }
    setRowBusy(track.id);
    setRowResult(null);
    try {
      await call("/api/admin/tracks", { method: "POST", body: uploadBody(track.id, picked) }, "Không tải được file lên.");
      setRowResult({ ok: true, text: `Đã gắn file cho “${track.title}”.` });
    } catch (error) {
      setRowResult({ ok: false, text: `${track.title}: ${error instanceof StepError ? error.message : "Không tải được file lên."}` });
    } finally {
      setRowBusy(null);
      await load();
    }
  }

  async function setPublished(track: AdminTrack, publish: boolean) {
    if (publish && track.usagePermission === "PREVIEW_ALLOWED" && !track.hasAudio) {
      if (!window.confirm("Bài này chưa có file nghe nên khách chỉ thấy thông tin. Vẫn đăng?")) return;
    }
    setRowBusy(track.id);
    setRowResult(null);
    try {
      await call(
        "/api/admin/tracks",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: publish ? "publish" : "unpublish", trackId: track.id, version: track.version }),
        },
        publish ? "Không đăng được bài." : "Không gỡ được bài.",
      );
      setRowResult({ ok: true, text: publish ? `Đã đăng “${track.title}” lên Khám phá.` : `Đã gỡ “${track.title}” khỏi Khám phá.` });
    } catch (error) {
      setRowResult({ ok: false, text: `${track.title}: ${error instanceof StepError ? error.message : "Không thực hiện được."}` });
    } finally {
      setRowBusy(null);
      await load();
    }
  }

  function toggleStage(id: string) {
    setStageIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function categorySelect(id: string, label: string, kind: string, value: string, onChange: (value: string) => void) {
    return (
      <div className="field">
        <label className="label" htmlFor={id}>{label}</label>
        <select id={id} className="select" value={value} onChange={(event) => onChange(event.target.value)} disabled={submitting}>
          <option value="">Không chọn</option>
          {byKind(kind).map((category) => (
            <option key={category.id} value={category.id}>{category.nameVi}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="wrap page">
      <Link href="/quan-tri" className="back-link"><ArrowLeftIcon className="h-4 w-4" />Về quản trị</Link>
      <header className="page-head">
        <div className="min-w-0">
          <h1 className="page-title">Danh mục nhạc</h1>
          <p className="page-lead">Tải nhạc lên, điền thông tin rồi đăng để bài hiện trên trang Khám phá.</p>
        </div>
      </header>

      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] max-md:gap-8">
        <form
          className="panel flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <h2 className="font-serif text-h3">Thêm nhạc mới</h2>

          <div className="field">
            <label className="label" htmlFor="track-title">Tên bài</label>
            <input
              id="track-title"
              className="input"
              maxLength={300}
              value={title}
              disabled={submitting}
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? "track-title-error" : undefined}
              onChange={(event) => {
                setTitle(event.target.value);
                if (errors.title) setErrors((current) => ({ ...current, title: "" }));
              }}
            />
            {errors.title ? <p id="track-title-error" className="text-sm text-danger" role="alert">{errors.title}</p> : null}
          </div>

          <div className="field">
            <label className="label" htmlFor="track-artist">Nghệ sĩ</label>
            <input
              id="track-artist"
              className="input"
              maxLength={200}
              value={artistName}
              disabled={submitting}
              aria-invalid={errors.artist ? true : undefined}
              aria-describedby={errors.artist ? "track-artist-error" : undefined}
              onChange={(event) => {
                setArtistName(event.target.value);
                if (errors.artist) setErrors((current) => ({ ...current, artist: "" }));
              }}
            />
            {errors.artist ? <p id="track-artist-error" className="text-sm text-danger" role="alert">{errors.artist}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="track-vocal">Loại giọng</label>
              <select id="track-vocal" className="select" value={vocalType} disabled={submitting} onChange={(event) => setVocalType(event.target.value as Vocal)}>
                {Object.entries(vocalLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="track-permission">Quyền sử dụng</label>
              <select
                id="track-permission"
                className="select"
                value={permission}
                disabled={submitting}
                onChange={(event) => {
                  setPermission(event.target.value as Permission);
                  setErrors((current) => ({ ...current, file: "" }));
                }}
              >
                {Object.entries(permissionLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="hint">“Cho nghe thử” cho khách nghe trực tiếp trên Khám phá và đưa bài vào thư viện của họ. Các mức khác chỉ hiện thông tin bài.</p>

          <div className="field">
            <label className="label" htmlFor="track-file">File nhạc (MP3 hoặc WAV, tối đa 100 MB)</label>
            <input
              key={fileKey}
              id="track-file"
              className="input py-2"
              type="file"
              accept=".mp3,.wav,audio/mpeg,audio/wav"
              disabled={submitting}
              aria-invalid={errors.file ? true : undefined}
              aria-describedby={errors.file ? "track-file-error" : undefined}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setErrors((current) => ({ ...current, file: "" }));
              }}
            />
            {file ? <p className="hint">{file.name}</p> : null}
            {errors.file ? <p id="track-file-error" className="text-sm text-danger" role="alert">{errors.file}</p> : null}
          </div>

          <div className="field">
            <label className="label" htmlFor="track-note">Ghi chú nguồn (không bắt buộc)</label>
            <textarea
              id="track-note"
              className="textarea"
              maxLength={2000}
              value={sourceNote}
              disabled={submitting}
              placeholder="Ví dụ: Nhạc tự sáng tác, có giấy phép"
              onChange={(event) => setSourceNote(event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {categorySelect("track-style", "Phong cách", "STYLE", styleId, setStyleId)}
            {categorySelect("track-mood", "Tâm trạng", "MOOD", moodId, setMoodId)}
            {categorySelect("track-language", "Ngôn ngữ", "LANGUAGE", languageId, setLanguageId)}
          </div>

          <fieldset className="field" disabled={submitting}>
            <legend className="label">Phần lễ gợi ý</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {byKind("CEREMONY").map((category) => (
                <label key={category.id} className="check">
                  <input type="checkbox" checked={stageIds.includes(category.id)} onChange={() => toggleStage(category.id)} />
                  {category.nameVi}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="check">
            <input type="checkbox" checked={publishNow} disabled={submitting} onChange={(event) => setPublishNow(event.target.checked)} />
            Đăng lên Khám phá ngay
          </label>

          <button className="btn btn-primary self-start max-sm:w-full" type="submit" disabled={submitting} aria-busy={submitting}>
            <PlusIcon />
            {submitting ? step : publishNow ? "Thêm và đăng" : "Lưu bản nháp"}
          </button>

          <div role="status" aria-live="polite" className="empty:hidden">
            {result?.ok ? (
              <p className="notice notice-ok">
                <CheckIcon />
                <span>{result.text}</span>
              </p>
            ) : null}
          </div>
          <div role="alert" className="empty:hidden">
            {result && !result.ok ? (
              <p className="notice notice-error">
                <AlertIcon />
                <span>{result.text}</span>
              </p>
            ) : null}
          </div>
        </form>

        <section aria-labelledby="catalog-list-title" className="min-w-0">
          <h2 id="catalog-list-title" className="section-title">Nhạc trong danh mục</h2>
          <div role="status" aria-live="polite" className="empty:hidden mt-4">
            {rowResult?.ok ? (
              <p className="notice notice-ok">
                <CheckIcon />
                <span>{rowResult.text}</span>
              </p>
            ) : null}
          </div>
          <div role="alert" className="empty:hidden mt-4">
            {rowResult && !rowResult.ok ? (
              <p className="notice notice-error">
                <AlertIcon />
                <span>{rowResult.text}</span>
              </p>
            ) : null}
          </div>
          {loadError ? (
            <p className="notice notice-error mt-4" role="alert"><AlertIcon /><span>{loadError}</span></p>
          ) : tracks === null ? (
            <div className="mt-4" aria-busy="true">
              <span className="sr-only">Đang tải…</span>
              <ul className="rows" aria-hidden="true">
                {[0, 1, 2].map((key) => (
                  <li key={key} className="py-5"><span className="skeleton block h-6 w-2/3" /></li>
                ))}
              </ul>
            </div>
          ) : tracks.length === 0 ? (
            <div className="empty mt-4">
              <p className="empty-title">Danh mục chưa có bài nào.</p>
              <p className="max-w-measure text-muted">Thêm bài đầu tiên ở biểu mẫu bên cạnh.</p>
            </div>
          ) : (
            <ul className="rows mt-4">
              {tracks.map((track) => (
                <TrackRow key={track.id} track={track} busy={rowBusy === track.id} onUpload={uploadFor} onPublish={setPublished} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
