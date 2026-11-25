"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { AudioPlayer } from "@/components/audio-player";
import { ExportControl } from "@/components/export-control";
import { clock } from "@/components/format";
import {
  AlertIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  InfoIcon,
  NoteIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { PlanNav, PlanStateChip, weddingDateLabel } from "@/components/plan-nav";

type Cue = {
  id: string;
  revisionId: string;
  instruction: string | null;
  responsiblePerson: string | null;
  listeningApprovedAt: string | null;
  assetFilename: string | null;
  revisionName: string | null;
  trimStartMs: number;
  trimEndMs: number;
  exportId: string | null;
  exportState: string;
  sourcePlaylistId: string | null;
};
type Stage = {
  id: string;
  name: string;
  description: string | null;
  approximateTime: string | null;
  estimatedDurationMs: number | null;
  status: string;
  cues: Cue[];
};
type Plan = {
  id: string;
  name: string;
  state: string;
  version: number;
  weddingDate: string | null;
  location: string | null;
  notes: string | null;
  timeZone: string;
  stages: Stage[];
};
type RevisionOption = { id: string; label: string };
type PlaylistOption = { id: string; name: string };
type Act = (body: Record<string, unknown>) => Promise<boolean>;

const stageStatusLabels: Record<string, string> = {
  MUSIC_REQUIRED: "Cần nhạc",
  NO_MUSIC: "Không dùng nhạc",
  SKIPPED: "Bỏ qua",
};

function moved(ids: string[], index: number, offset: number) {
  const next = [...ids];
  const [item] = next.splice(index, 1);
  next.splice(index + offset, 0, item);
  return next;
}

function summarize(stages: Stage[]) {
  let required = 0;
  let withMusic = 0;
  let cues = 0;
  let unheard = 0;
  let mp3 = 0;
  for (const stage of stages) {
    if (stage.status !== "MUSIC_REQUIRED") continue;
    required += 1;
    if (stage.cues.length > 0) withMusic += 1;
    for (const cue of stage.cues) {
      cues += 1;
      if (!cue.listeningApprovedAt) unheard += 1;
      if (cue.exportState === "COMPLETED" && cue.exportId) mp3 += 1;
    }
  }
  return { required, withMusic, cues, unheard, mp3 };
}

const summaryClass = "flex min-w-0 flex-col justify-between gap-1 border-l border-line pl-4 max-sm:pl-3";
const disclosureSummary = "cursor-pointer list-none [&::-webkit-details-marker]:hidden";

export default function PlanDetailPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [revisions, setRevisions] = useState<RevisionOption[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/plans/${planId}`);
    if (response.status === 401) {
      window.location.href = `/dang-nhap?next=/ke-hoach/${planId}`;
      return;
    }
    if (!response.ok) {
      setLoadError(response.status === 404 ? "Không thấy kế hoạch này." : "Không tải được kế hoạch.");
      return;
    }
    setPlan(await response.json());
  }, [planId]);

  const loaded = plan !== null;
  useEffect(() => {
    if (!loaded || !window.location.hash.startsWith("#stage-")) return;
    document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView({ block: "start" });
  }, [loaded]);

  useEffect(() => {
    void load();
    void fetch("/api/library").then(async (response) => {
      if (!response.ok) return;
      const body = await response.json();
      const options: RevisionOption[] = [];
      for (const asset of body.items ?? []) {
        for (const revision of asset.revisions ?? []) {
          options.push({
            id: revision.id,
            label: `${revision.name || asset.originalFilename || "Không tên"} · ${clock(revision.trimStartMs, true)} → ${clock(revision.trimEndMs, true)}`,
          });
        }
      }
      setRevisions(options);
    });
    void fetch("/api/playlists").then(async (response) => {
      if (!response.ok) return;
      const body = await response.json();
      setPlaylists(
        (body.items ?? [])
          .filter((item: { archivedAt?: string | null }) => !item.archivedAt)
          .map((item: PlaylistOption) => ({ id: item.id, name: item.name })),
      );
    });
  }, [load]);

  const handleResult = useCallback(async (response: Response, fallback: string) => {
    const body = await response.json().catch(() => ({}));
    if (response.status === 409) {
      setMessage("Kế hoạch vừa được sửa ở nơi khác. Đã tải lại bản mới nhất, hãy làm lại thao tác.");
      await load();
      return null;
    }
    if (!response.ok) {
      setMessage(body.error?.message ?? fallback);
      return null;
    }
    setMessage("");
    return body;
  }, [load]);

  const act: Act = useCallback(async (body) => {
    if (!plan) return false;
    const response = await fetch(`/api/plans/${planId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, version: plan.version }),
    });
    const result = await handleResult(response, "Không lưu được thay đổi.");
    if (result && body.action !== "duplicate") setPlan(result);
    return Boolean(result);
  }, [plan, planId, handleResult]);

  if (loadError) {
    return (
      <div className="wrap page">
        <Link className="back-link" href="/ke-hoach"><ArrowLeftIcon className="h-4 w-4" />Về danh sách kế hoạch</Link>
        <p className="notice notice-error max-w-measure" role="alert"><AlertIcon />{loadError}</p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="wrap page" aria-busy="true">
        <span className="sr-only">Đang tải kế hoạch…</span>
        <span className="skeleton h-5 w-40" />
        <span className="skeleton mt-6 h-12 w-2/3 max-w-xl" />
        <span className="skeleton mt-6 h-6 w-full max-w-lg" />
        <span className="skeleton mt-12 h-12 w-full" />
        <div className="mt-12 flex flex-col gap-6">
          {[0, 1, 2].map((key) => <span key={key} className="skeleton h-32 w-full" />)}
        </div>
      </div>
    );
  }

  const stats = summarize(plan.stages);
  const date = weddingDateLabel(plan.weddingDate);
  const meta = [date, plan.location].filter(Boolean).join(" · ");

  return (
    <div className="wrap page">
      <header className="pb-8">
        <Link className="back-link" href="/ke-hoach"><ArrowLeftIcon className="h-4 w-4" />Về danh sách kế hoạch</Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <h1 className="page-title min-w-0 break-words">{plan.name}</h1>
          <PlanStateChip state={plan.state} />
        </div>
        {meta ? <p className="mt-3 text-lead text-muted">{meta}</p> : null}
        <dl className="mt-8 grid max-w-3xl grid-cols-3 gap-6 max-sm:gap-3">
          <div className={summaryClass}>
            <dt className="label">Phần cần nhạc đã có bài</dt>
            <dd className="tnum font-serif text-h2 max-sm:text-h3">{stats.withMusic}/{stats.required}</dd>
          </div>
          <div className={summaryClass}>
            <dt className="label">Điểm nhạc chưa nghe</dt>
            <dd className={`tnum font-serif text-h2 max-sm:text-h3 ${stats.unheard > 0 ? "text-warn" : ""}`}>{stats.unheard}</dd>
          </div>
          <div className={summaryClass}>
            <dt className="label">MP3 sẵn sàng</dt>
            <dd className="tnum font-serif text-h2 max-sm:text-h3">{stats.mp3}/{stats.cues}</dd>
          </div>
        </dl>
      </header>

      <PlanNav planId={planId} />

      {message ? (
        <p className="notice notice-error sticky top-[calc(var(--nav-h)+8px)] z-20 mt-6" role="alert"><AlertIcon />{message}</p>
      ) : null}

      <PlanProfile
        key={`${plan.name}|${plan.weddingDate}|${plan.location}|${plan.notes}`}
        plan={plan}
        onSave={async (fields) => {
          const response = await fetch(`/api/plans/${planId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...fields, version: plan.version }),
          });
          const result = await handleResult(response, "Không lưu được thông tin kế hoạch.");
          if (result) setPlan(result);
        }}
        onArchive={() => void act({ action: plan.state === "ARCHIVED" ? "reopen" : "archive" })}
        onDuplicate={async () => {
          const response = await fetch(`/api/plans/${planId}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "duplicate" }),
          });
          const result = await handleResult(response, "Không sao chép được kế hoạch.");
          if (result) router.push(`/ke-hoach/${result.id}`);
        }}
        onDelete={async () => {
          if (!window.confirm(`Xoá kế hoạch "${plan.name}"? Thao tác này không hoàn tác được.`)) return;
          const response = await fetch(`/api/plans/${planId}`, {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ confirm: true, version: plan.version }),
          });
          if (await handleResult(response, "Không xoá được kế hoạch.")) router.push("/ke-hoach");
        }}
      />

      <section aria-labelledby="timeline-title" className="mt-16 max-md:mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 id="timeline-title" className="section-title">Trình tự lễ</h2>
          <p className="tnum text-sm text-muted">{plan.stages.length} phần</p>
        </div>
        {plan.stages.length === 0 ? (
          <div className="empty mt-8">
            <p className="empty-title">Kế hoạch chưa có phần lễ nào.</p>
            <p className="max-w-measure text-muted">Thêm phần đầu tiên, ví dụ đón khách hoặc làm lễ gia tiên, rồi chọn nhạc cho từng phần.</p>
          </div>
        ) : (
          <ol className="mt-8">
            {plan.stages.map((stage, index) => (
              <StageCard
                key={stage.id}
                stage={stage}
                index={index}
                last={index === plan.stages.length - 1}
                stageIds={plan.stages.map((item) => item.id)}
                revisions={revisions}
                playlists={playlists}
                act={act}
                reload={load}
              />
            ))}
          </ol>
        )}
        <AddStageForm act={act} />
      </section>
    </div>
  );
}

function PlanProfile({
  plan,
  onSave,
  onArchive,
  onDuplicate,
  onDelete,
}: {
  plan: Plan;
  onSave: (fields: { name: string; weddingDate: string | null; location: string | null; notes: string | null }) => Promise<void>;
  onArchive: () => void;
  onDuplicate: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(plan.name);
  const [nameError, setNameError] = useState("");
  const [weddingDate, setWeddingDate] = useState(plan.weddingDate ?? "");
  const [location, setLocation] = useState(plan.location ?? "");
  const [notes, setNotes] = useState(plan.notes ?? "");
  return (
    <details className="panel group mt-8">
      <summary className={`${disclosureSummary} -m-2 flex min-h-[44px] items-center justify-between gap-4 rounded-sm p-2`}>
        <span className="flex min-w-0 flex-col">
          <span className="font-serif text-h3">Thông tin kế hoạch</span>
          <span className="text-sm text-muted">Tên, ngày cưới, địa điểm, ghi chú, lưu trữ và xoá</span>
        </span>
        <ArrowDownIcon className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <form
        className="mt-6 grid gap-4 md:grid-cols-2 md:gap-x-6"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) {
            setNameError("Cần nhập tên kế hoạch.");
            return;
          }
          setNameError("");
          void onSave({ name: trimmed, weddingDate: weddingDate || null, location: location || null, notes: notes || null });
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
        <div className="field">
          <label className="label" htmlFor="plan-date">Ngày cưới</label>
          <input id="plan-date" className="input" type="date" value={weddingDate} onChange={(event) => setWeddingDate(event.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="plan-location">Địa điểm</label>
          <input id="plan-location" className="input" maxLength={240} value={location} onChange={(event) => setLocation(event.target.value)} />
        </div>
        <div className="field md:col-span-2">
          <label className="label" htmlFor="plan-notes">Ghi chú</label>
          <textarea id="plan-notes" className="textarea" maxLength={8000} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
        <div className="flex flex-wrap gap-3 md:col-span-2 max-sm:flex-col">
          <button type="submit" className="btn btn-primary max-sm:w-full">Lưu thông tin</button>
          <button type="button" className="btn btn-secondary max-sm:w-full" onClick={onArchive}>
            {plan.state === "ARCHIVED" ? "Mở lại kế hoạch" : "Lưu trữ"}
          </button>
          <button type="button" className="btn btn-secondary max-sm:w-full" onClick={() => void onDuplicate()}>
            <CopyIcon />Sao chép kế hoạch
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 md:col-span-2">
          <p className="hint max-w-measure">Xoá kế hoạch cùng toàn bộ phần lễ và điểm nhạc. Không hoàn tác được.</p>
          <button type="button" className="btn btn-danger max-sm:w-full" onClick={() => void onDelete()}>
            <TrashIcon />Xoá kế hoạch
          </button>
        </div>
      </form>
    </details>
  );
}

function StageStatusChip({ stage }: { stage: Stage }) {
  if (stage.status === "MUSIC_REQUIRED") {
    return stage.cues.length > 0
      ? <span className="chip chip-ok"><CheckIcon />Đã có nhạc</span>
      : <span className="chip chip-warn"><AlertIcon />Chưa có nhạc</span>;
  }
  return <span className="chip">{stageStatusLabels[stage.status] ?? "Không rõ"}</span>;
}

function StageCard({
  stage,
  index,
  last,
  stageIds,
  revisions,
  playlists,
  act,
  reload,
}: {
  stage: Stage;
  index: number;
  last: boolean;
  stageIds: string[];
  revisions: RevisionOption[];
  playlists: PlaylistOption[];
  act: Act;
  reload: () => Promise<void>;
}) {
  const [revisionId, setRevisionId] = useState("");
  const [instruction, setInstruction] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const cueIds = stage.cues.map((cue) => cue.id);
  const active = stage.status === "MUSIC_REQUIRED";
  const number = index + 1;
  const hasSnapshot = stage.cues.some((cue) => cue.sourcePlaylistId === playlistId);
  return (
    <li className="grid md:grid-cols-[64px_minmax(0,1fr)] md:gap-x-6 lg:grid-cols-[96px_minmax(0,1fr)]" aria-labelledby={`stage-${stage.id}`}>
      <div className="relative border-r-2 border-champagne-deep pr-4 pt-1 lg:pr-6 text-right max-md:hidden">
        <span className={`absolute -right-[7px] top-3 h-3 w-3 rounded-full border-2 bg-ivory ${active ? "border-wine" : "border-champagne-deep"}`} aria-hidden="true" />
        {stage.approximateTime ? (
          <>
            <p className="tnum break-words font-serif text-h3 max-lg:text-base max-lg:font-medium">{stage.approximateTime}</p>
            <p className="tnum mt-1 text-sm text-muted">Phần {number}</p>
          </>
        ) : (
          <p className="tnum font-serif text-h3 text-muted">{number}</p>
        )}
      </div>

      <div className={`min-w-0 ${last ? "pb-4" : "pb-12 max-md:mb-8 max-md:border-b max-md:border-line max-md:pb-8"}`}>
        <div className="flex items-start justify-between gap-x-6 gap-y-2 max-md:flex-col">
          <div className="flex min-w-0 items-start gap-3">
            <span className="tnum mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-champagne font-serif text-base md:hidden" aria-hidden="true">{number}</span>
            <div className="min-w-0">
              <h3 id={`stage-${stage.id}`} className="break-words font-serif text-h3">
                <span className="sr-only">Phần {number}: </span>{stage.name}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                <StageStatusChip stage={stage} />
                {stage.approximateTime ? <span className="tnum md:hidden">Lúc {stage.approximateTime}</span> : null}
                {stage.estimatedDurationMs !== null ? (
                  <span className="tnum inline-flex items-center gap-1.5"><ClockIcon className="h-4 w-4" />Dự kiến {clock(stage.estimatedDurationMs)}</span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center max-md:-ml-3 md:-mr-3 md:-mt-1">
            <button type="button" className="icon-btn" disabled={index === 0} aria-label={`Đưa phần ${stage.name} lên`}
              onClick={() => void act({ action: "reorder-stages", stageIds: moved(stageIds, index, -1) })}><ArrowUpIcon /></button>
            <button type="button" className="icon-btn" disabled={index === stageIds.length - 1} aria-label={`Đưa phần ${stage.name} xuống`}
              onClick={() => void act({ action: "reorder-stages", stageIds: moved(stageIds, index, 1) })}><ArrowDownIcon /></button>
            <button type="button" className="icon-btn" aria-label={`Nhân bản phần ${stage.name}`}
              onClick={() => void act({ action: "duplicate-stage", stageId: stage.id })}><CopyIcon /></button>
            <button type="button" className="icon-btn icon-btn-danger" aria-label={`Xoá phần ${stage.name}`} onClick={() => {
              if (window.confirm(`Xoá phần "${stage.name}" cùng ${stage.cues.length} điểm nhạc?`)) void act({ action: "remove-stage", stageId: stage.id });
            }}><TrashIcon /></button>
          </div>
        </div>

        {stage.description ? <p className="mt-3 max-w-measure text-muted">{stage.description}</p> : null}

        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
          <div className="flex items-center gap-3">
            <label className="label" htmlFor={`status-${stage.id}`}>Trạng thái<span className="sr-only"> phần {stage.name}</span></label>
            <select
              id={`status-${stage.id}`}
              value={stage.status}
              onChange={(event) => void act({ action: "update-stage", stageId: stage.id, status: event.target.value })}
              className="select w-auto"
            >
              {Object.entries(stageStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <StageDetails key={`${stage.name}|${stage.description}|${stage.approximateTime}|${stage.estimatedDurationMs}`} stage={stage} act={act} />
        </div>

        {!active && stage.cues.length > 0 ? (
          <p className="notice notice-info mt-4 max-w-measure"><InfoIcon />Các điểm nhạc được giữ lại nhưng không đưa vào gói bàn giao.</p>
        ) : null}

        {stage.cues.length > 0 ? (
          <ul className={`mt-4 flex flex-col gap-3 ${active ? "" : "border-l-2 border-dashed border-champagne-deep pl-4"}`}>
            {stage.cues.map((cue, cueIndex) => (
              <CueRow key={`${cue.id}|${cue.instruction}|${cue.responsiblePerson}`} cue={cue} index={cueIndex} stageId={stage.id} stageName={stage.name} cueIds={cueIds} act={act} reload={reload} />
            ))}
          </ul>
        ) : null}
        {stage.cues.length === 0 && active ? <p className="mt-4 text-muted">Chưa có bài cho phần này.</p> : null}

        <details className="group mt-4">
          <summary className={`${disclosureSummary} btn btn-secondary btn-sm max-sm:w-full`}>
            <PlusIcon />Thêm nhạc cho phần này
          </summary>
          <div className="mt-4 grid gap-6 rounded-md border border-line p-6 max-md:p-4 lg:grid-cols-2">
            <form
              className="flex min-w-0 flex-col gap-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!revisionId) return;
                if (await act({ action: "add-cue", stageId: stage.id, revisionId, instruction: instruction || null })) {
                  setRevisionId("");
                  setInstruction("");
                }
              }}
            >
              <p className="font-medium">Thêm một bản chỉnh</p>
              <div className="field">
                <label className="label" htmlFor={`rev-${stage.id}`}>Bản chỉnh trong thư viện<span className="sr-only"> cho phần {stage.name}</span></label>
                <select id={`rev-${stage.id}`} required value={revisionId} onChange={(event) => setRevisionId(event.target.value)} className="select">
                  <option value="">Chọn bản chỉnh</option>
                  {revisions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
                {revisions.length === 0 ? <p className="hint">Thư viện chưa có bản chỉnh nào. <Link className="link" href="/thu-vien">Mở thư viện</Link></p> : null}
              </div>
              <div className="field">
                <label className="label" htmlFor={`ins-${stage.id}`}>Cách phát<span className="sr-only"> cho phần {stage.name}</span></label>
                <input id={`ins-${stage.id}`} value={instruction} maxLength={2000} onChange={(event) => setInstruction(event.target.value)} placeholder="Ví dụ: khi MC mời cô dâu" className="input" />
              </div>
              <button className="btn btn-secondary self-start max-sm:w-full" type="submit">Thêm điểm nhạc</button>
            </form>
            <div className="flex min-w-0 flex-col gap-4 max-lg:border-t max-lg:border-line max-lg:pt-6 lg:border-l lg:border-line lg:pl-6">
              <p className="font-medium">Thêm từ danh sách phát</p>
              {playlists.length === 0 ? (
                <p className="hint">
                  Chưa có danh sách phát. <Link className="link" href="/danh-sach-phat">Tạo danh sách phát</Link>, xếp các bài, rồi chép cả danh sách vào phần này.
                </p>
              ) : (
                <form
                  className="flex min-w-0 flex-col gap-4"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!playlistId) return;
                    const snapshot = stage.cues.some((cue) => cue.sourcePlaylistId === playlistId);
                    await act({ action: snapshot ? "refresh-playlist" : "snapshot", stageId: stage.id, playlistId });
                  }}
                >
                  <div className="field">
                    <label className="label" htmlFor={`pl-${stage.id}`}>Danh sách phát<span className="sr-only"> cho phần {stage.name}</span></label>
                    <select id={`pl-${stage.id}`} required value={playlistId} onChange={(event) => setPlaylistId(event.target.value)} className="select">
                      <option value="">Chọn danh sách phát</option>
                      {playlists.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </select>
                    <p className="hint">Các bài được chép vào phần này. Danh sách đổi sau đó thì bấm làm mới.</p>
                  </div>
                  <button className="btn btn-secondary self-start max-sm:w-full" type="submit">
                    {hasSnapshot ? "Làm mới từ danh sách" : "Chép vào phần này"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </details>
      </div>
    </li>
  );
}

function StageDetails({ stage, act }: { stage: Stage; act: Act }) {
  const [name, setName] = useState(stage.name);
  const [description, setDescription] = useState(stage.description ?? "");
  const [approximateTime, setApproximateTime] = useState(stage.approximateTime ?? "");
  const [minutes, setMinutes] = useState(stage.estimatedDurationMs === null ? "" : String(stage.estimatedDurationMs / 60000));
  return (
    <details className="group w-full [&:not([open])]:w-auto">
      <summary className={`${disclosureSummary} inline-flex min-h-[44px] items-center gap-2 font-medium text-wine hover:underline`}>
        Sửa chi tiết phần lễ
        <ArrowDownIcon className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <form
        className="mt-2 grid gap-4 rounded-md border border-line p-6 max-md:p-4 md:grid-cols-2 md:gap-x-6"
        onSubmit={(event) => {
          event.preventDefault();
          void act({
            action: "update-stage",
            stageId: stage.id,
            name: name.trim(),
            description: description.trim() || null,
            approximateTime: approximateTime.trim() || null,
            estimatedDurationMs: minutes === "" ? null : Math.round(Number(minutes) * 60000),
          });
        }}
      >
        <div className="field">
          <label className="label" htmlFor={`sname-${stage.id}`}>Tên phần</label>
          <input id={`sname-${stage.id}`} className="input" required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor={`stime-${stage.id}`}>Thời điểm dự kiến</label>
          <input id={`stime-${stage.id}`} className="input" maxLength={80} value={approximateTime} onChange={(event) => setApproximateTime(event.target.value)} placeholder="Ví dụ: 18:30" />
        </div>
        <div className="field">
          <label className="label" htmlFor={`smin-${stage.id}`}>Thời lượng dự kiến (phút)</label>
          <input id={`smin-${stage.id}`} className="input tnum" type="number" min={0} max={1440} step={0.5} value={minutes} onChange={(event) => setMinutes(event.target.value)} />
        </div>
        <div className="field md:row-span-2">
          <label className="label" htmlFor={`sdesc-${stage.id}`}>Mô tả</label>
          <textarea id={`sdesc-${stage.id}`} className="textarea" maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
        <div className="self-end">
          <button type="submit" className="btn btn-secondary max-sm:w-full">Lưu phần lễ</button>
        </div>
      </form>
    </details>
  );
}

function CueRow({
  cue,
  index,
  stageId,
  stageName,
  cueIds,
  act,
  reload,
}: {
  cue: Cue;
  index: number;
  stageId: string;
  stageName: string;
  cueIds: string[];
  act: Act;
  reload: () => Promise<void>;
}) {
  const [instruction, setInstruction] = useState(cue.instruction ?? "");
  const [responsible, setResponsible] = useState(cue.responsiblePerson ?? "");
  const approved = Boolean(cue.listeningApprovedAt);
  const changed = instruction !== (cue.instruction ?? "") || responsible !== (cue.responsiblePerson ?? "");
  useEffect(() => {
    if (!changed) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);
  const fileName = cue.revisionName || cue.assetFilename || "Không tên";
  const named = `điểm nhạc ${index + 1} (${fileName})`;
  return (
    <li className="panel flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3 max-sm:gap-y-1">
        <NoteIcon className="mt-1 h-5 w-5 shrink-0 text-wine" />
        <div className="min-w-0 flex-1">
          <p className="font-medium [overflow-wrap:anywhere]">{fileName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="tnum text-sm text-muted">{clock(cue.trimStartMs, true)} → {clock(cue.trimEndMs, true)}</span>
            {approved
              ? <span className="chip chip-ok"><CheckIcon />Đã nghe</span>
              : <span className="chip chip-warn"><AlertIcon />Chưa nghe</span>}
          </div>
        </div>
        <div className="-mr-2 -mt-2 flex shrink-0 items-center max-sm:-ml-3 max-sm:mr-0 max-sm:mt-0 max-sm:basis-full">
          <button type="button" className="icon-btn" disabled={index === 0} aria-label={`Đưa ${named} lên`}
            onClick={() => void act({ action: "reorder-cues", stageId, cueIds: moved(cueIds, index, -1) })}><ArrowUpIcon /></button>
          <button type="button" className="icon-btn" disabled={index === cueIds.length - 1} aria-label={`Đưa ${named} xuống`}
            onClick={() => void act({ action: "reorder-cues", stageId, cueIds: moved(cueIds, index, 1) })}><ArrowDownIcon /></button>
          <button type="button" className="icon-btn icon-btn-danger" aria-label={`Bỏ ${named} khỏi phần ${stageName}`} onClick={() => {
            if (window.confirm("Bỏ điểm nhạc này khỏi phần lễ?")) void act({ action: "remove-cue", cueId: cue.id });
          }}><TrashIcon /></button>
        </div>
      </div>

      {cue.exportState === "COMPLETED" && cue.exportId ? (
        <AudioPlayer compact name={`${fileName}, phần ${stageName}`} src={`/api/exports/${cue.exportId}/file`} label="Nghe bản MP3 sẽ bàn giao" />
      ) : (
        <ExportControl
          revisionId={cue.revisionId}
          initial={cue.exportId ? { id: cue.exportId, state: cue.exportState, errorCode: null, durationMs: null } : null}
          onCompleted={() => void reload()}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2 md:gap-x-6">
        <div className="field">
          <label className="label" htmlFor={`cue-ins-${cue.id}`}>Cách phát</label>
          <input id={`cue-ins-${cue.id}`} className="input" value={instruction} maxLength={2000} onChange={(event) => setInstruction(event.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor={`cue-who-${cue.id}`}>Người phụ trách</label>
          <input id={`cue-who-${cue.id}`} className="input" value={responsible} maxLength={120} onChange={(event) => setResponsible(event.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <label className="check">
          <input
            type="checkbox"
            checked={approved}
            onChange={(event) => void act({ action: "update-cue", cueId: cue.id, listeningApproved: event.target.checked })}
          />
          Tôi đã nghe bản này
        </label>
        {changed ? (
          <div className="flex flex-wrap items-center gap-3 max-sm:w-full">
            <span className="text-sm text-warn" role="status">Chưa lưu</span>
            <button
              type="button"
              className="btn btn-primary btn-sm max-sm:flex-1"
              onClick={() => void act({ action: "update-cue", cueId: cue.id, instruction: instruction || null, responsiblePerson: responsible || null })}
            >
              Lưu điểm nhạc
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function AddStageForm({ act }: { act: Act }) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  return (
    <form
      className="mt-8 border-t border-line pt-8 md:ml-[88px] lg:ml-[120px]"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) {
          setNameError("Cần nhập tên phần lễ.");
          return;
        }
        setNameError("");
        if (await act({ action: "add-stage", name: name.trim() })) setName("");
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="field min-w-0 flex-1 basis-64">
          <label className="label" htmlFor="new-stage">Tên phần lễ mới</label>
          <input
            id="new-stage"
            className="input"
            value={name}
            maxLength={160}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "new-stage-error" : undefined}
            onChange={(event) => {
              setName(event.target.value);
              if (nameError) setNameError("");
            }}
            placeholder="Ví dụ: Rót rượu mừng"
          />
        </div>
        <button type="submit" className="btn btn-secondary max-sm:w-full"><PlusIcon />Thêm phần lễ</button>
      </div>
      {nameError ? <p id="new-stage-error" className="mt-2 text-sm text-danger" role="alert">{nameError}</p> : null}
    </form>
  );
}
