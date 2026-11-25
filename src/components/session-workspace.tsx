"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { clock } from "@/components/format";
import {
  AlertIcon,
  ArrowLeftIcon,
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  RedoIcon,
  ScissorsIcon,
  StopIcon,
  TrashIcon,
  UndoIcon,
  UploadIcon,
  VolumeIcon,
  ZoomInIcon,
} from "@/components/icons";
import { safeThumbnail } from "@/components/youtube-import-status";
import {
  keptDurationMs,
  outputMsAtSource,
  sourceMsAtOutput,
  splitEdits,
  validateEdits,
  type AudioEdits,
  type AudioSegment,
} from "@/server/audio/edits";
import type { SessionView } from "@/server/audio/session-view";

const stateLabels: Record<string, string> = {
  CREATED: "Đã tạo phiên",
  FETCHING_METADATA: "Đang lấy thông tin",
  IMPORTING_AUDIO: "Đang nhập audio",
  CONVERTING_AUDIO: "Đang chuyển đổi audio",
  GENERATING_WAVEFORM: "Đang tạo dạng sóng",
  READY: "Sẵn sàng sửa",
  EXPORTING: "Đang xuất MP3",
  FAILED: "Chưa có audio",
  EXPIRED: "Đã hết hạn",
};

const errorLabels: Record<string, string> = {
  VIDEO_UNAVAILABLE: "Video riêng tư, đã gỡ, hoặc không xem được.",
  METADATA_FAILED: "Không lấy được thông tin video.",
  MALFORMED_URL: "Liên kết YouTube không hợp lệ.",
  INVALID_AUDIO: "Nội dung không phải MP3 hoặc WAV hợp lệ.",
  FILE_TOO_LARGE: "File vượt quá kích thước cho phép.",
  DURATION_EXCEEDED: "Bản nhạc dài hơn giới hạn cho phép.",
  UNSUPPORTED_FORMAT: "Chỉ nhận MP3 hoặc WAV.",
  DURATION_MISMATCH: "File sau chuyển đổi không giữ đủ độ dài.",
  PROCESSING_FAILED: "Không xử lý được file này.",
  WAVEFORM_FAILED: "Không tạo được dạng sóng từ audio.",
  DURATION_TOO_SHORT: "Bản nhạc ngắn hơn một giây.",
  RENDER_FAILED: "Không xuất được file MP3.",
  FILE_REQUIRED: "Hãy chọn file nhạc.",
};

const steps = ["IMPORTING_AUDIO", "CONVERTING_AUDIO", "GENERATING_WAVEFORM", "READY"] as const;

function clampSegment(segments: AudioSegment[], index: number, startMs: number, endMs: number, durationMs: number) {
  const grid = Math.floor(durationMs / 10) * 10;
  const previous = index > 0 ? segments[index - 1].endMs : 0;
  const next = index < segments.length - 1 ? segments[index + 1].startMs : grid;
  const maxEnd = Math.min(grid, next);
  const start = Math.max(previous, Math.min(Math.round(startMs / 10) * 10, maxEnd - 100));
  const end = Math.min(maxEnd, Math.max(Math.round(endMs / 10) * 10, start + 100));
  return { startMs: start, endMs: end };
}

export function SessionWorkspace({ initial, focusUpload }: { initial: SessionView; focusUpload: boolean }) {
  const [session, setSession] = useState(initial);
  const [edits, setEdits] = useState<AudioEdits>(initial.edits);
  const [history, setHistory] = useState<AudioEdits[]>([]);
  const [future, setFuture] = useState<AudioEdits[]>([]);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [waveError, setWaveError] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const [audioReady, setAudioReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [listen, setListen] = useState(0.9);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportId, setExportId] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const editsRef = useRef(edits);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const listenGainRef = useRef<GainNode | null>(null);
  const playRef = useRef<{ at: number; fromOutputMs: number } | null>(null);
  const playingRef = useRef(false);
  const playToken = useRef(0);
  const rafRef = useRef(0);
  const outputRef = useRef(0);
  const saveTimer = useRef<number | null>(null);
  const pollToken = useRef(0);
  const durationMs = session.durationMs;
  const editable =
    (session.state === "READY" || session.state === "EXPORTING") &&
    durationMs !== null &&
    edits.segments.length > 0;
  editsRef.current = edits;

  function paint(sourceMs: number) {
    const head = playheadRef.current;
    if (head && durationMs) head.style.left = `${(sourceMs / durationMs) * 100}%`;
    if (timeRef.current && durationMs) {
      timeRef.current.textContent = `${clock(sourceMs, true)} / ${clock(durationMs, true)}`;
    }
  }

  function currentOutput(): number {
    const play = playRef.current;
    const context = contextRef.current;
    if (!play || !context) return outputRef.current;
    return play.fromOutputMs + (context.currentTime - play.at) * 1000;
  }

  function stopSources() {
    const sources = sourcesRef.current;
    sourcesRef.current = [];
    for (const source of sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        continue;
      }
    }
  }

  function pause() {
    playToken.current += 1;
    const output = currentOutput();
    outputRef.current = output;
    stopSources();
    playingRef.current = false;
    setPlaying(false);
    playRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const source = sourceMsAtOutput(editsRef.current, output);
    setCursor(source);
    paint(source);
  }

  function stop() {
    playToken.current += 1;
    outputRef.current = 0;
    stopSources();
    playingRef.current = false;
    setPlaying(false);
    playRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setCursor(0);
    paint(0);
  }

  function frame() {
    if (!playingRef.current || !playRef.current || !contextRef.current) return;
    const output = currentOutput();
    const total = keptDurationMs(editsRef.current);
    if (output >= total) {
      playingRef.current = false;
      setPlaying(false);
      playRef.current = null;
      const end = sourceMsAtOutput(editsRef.current, total);
      setCursor(end);
      paint(end);
      return;
    }
    paint(sourceMsAtOutput(editsRef.current, output));
    rafRef.current = requestAnimationFrame(frame);
  }

  async function startPlayback(fromOutputMs: number, score: AudioEdits) {
    const context = contextRef.current;
    const buffer = bufferRef.current;
    if (!context || !buffer) return;
    const token = playToken.current + 1;
    playToken.current = token;
    stopSources();
    if (context.state === "suspended") await context.resume();
    if (playToken.current !== token) return;
    const total = keptDurationMs(score);
    const startAt = Math.max(0, Math.min(fromOutputMs, Math.max(0, total - 10)));
    const amp = Math.max(0.0001, 10 ** (score.gainDb / 20));
    const kept = total / 1000;
    const fadeIn = Math.min(kept, score.fadeInMs / 1000);
    const fadeOut = Math.min(Math.max(0, kept - fadeIn), score.fadeOutMs / 1000);
    const levelAt = (time: number) => {
      let value = amp;
      if (fadeIn > 0 && time < fadeIn) value *= time / fadeIn;
      if (fadeOut > 0 && time > kept - fadeOut) value *= Math.max(0, (kept - time) / fadeOut);
      return Math.max(0.0001, value);
    };
    const envelope = context.createGain();
    const listenGain = context.createGain();
    listenGain.gain.value = listenRef.current;
    listenGainRef.current = listenGain;
    envelope.connect(listenGain);
    listenGain.connect(context.destination);
    const now = context.currentTime;
    envelope.gain.setValueAtTime(levelAt(startAt / 1000), now);
    if (fadeIn > 0 && startAt / 1000 < fadeIn) {
      envelope.gain.linearRampToValueAtTime(amp, now + (fadeIn - startAt / 1000));
    }
    const fadeOutStart = Math.max(0, kept - fadeOut);
    if (fadeOut > 0 && fadeOutStart > startAt / 1000) {
      envelope.gain.setValueAtTime(amp, now + (fadeOutStart - startAt / 1000));
      envelope.gain.linearRampToValueAtTime(0.0001, now + (kept - startAt / 1000));
    }
    let output = 0;
    const sources: AudioBufferSourceNode[] = [];
    for (const segment of score.segments) {
      const length = segment.endMs - segment.startMs;
      const end = output + length;
      if (end > startAt + 1) {
        const skip = Math.max(0, startAt - output);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(envelope);
        source.start(
          now + (output + skip - startAt) / 1000,
          (segment.startMs + skip) / 1000,
          Math.max(0.01, (length - skip) / 1000),
        );
        sources.push(source);
      }
      output = end;
    }
    const last = sources[sources.length - 1];
    if (!last) return;
    last.onended = () => {
      if (sourcesRef.current[sourcesRef.current.length - 1] !== last) return;
      playingRef.current = false;
      setPlaying(false);
      playRef.current = null;
      const end = sourceMsAtOutput(score, total);
      setCursor(end);
      paint(end);
    };
    sourcesRef.current = sources;
    playRef.current = { at: now, fromOutputMs: startAt };
    outputRef.current = startAt;
    playingRef.current = true;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(frame);
  }

  const listenRef = useRef(listen);
  listenRef.current = listen;

  async function persist(next: AudioEdits): Promise<boolean> {
    const response = await fetch(`/api/audio/sessions/${session.id}/edits`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    if (response.status === 410) {
      setExpired(true);
      return false;
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setMessage(body?.error?.message ?? "Không lưu được thao tác sửa.");
      return false;
    }
    return true;
  }

  function commit(next: AudioEdits, record: boolean) {
    if (durationMs === null || validateEdits(next, durationMs)) return;
    if (record) {
      const previous = editsRef.current;
      setHistory((stack) => [...stack, previous]);
      setFuture([]);
    }
    editsRef.current = next;
    setEdits(next);
    setExportId(null);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist(next);
    }, 350);
    if (playingRef.current) void startPlayback(currentOutput(), next);
  }

  function undo() {
    setHistory((stack) => {
      const previous = stack[stack.length - 1];
      if (!previous) return stack;
      setFuture((items) => [editsRef.current, ...items]);
      editsRef.current = previous;
      setEdits(previous);
      void persist(previous);
      return stack.slice(0, -1);
    });
  }

  function redo() {
    setFuture((items) => {
      const next = items[0];
      if (!next) return items;
      setHistory((stack) => [...stack, editsRef.current]);
      editsRef.current = next;
      setEdits(next);
      void persist(next);
      return items.slice(1);
    });
  }

  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  const pauseRef = useRef(pause);
  undoRef.current = undo;
  redoRef.current = redo;
  pauseRef.current = pause;

  useEffect(() => {
    if (focusUpload) fileRef.current?.focus();
  }, [focusUpload]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetch(`/api/audio/sessions/${session.id}/status`).then((response) => {
        if (response.status === 410) setExpired(true);
      });
    }, 20000);
    return () => window.clearInterval(timer);
  }, [session.id]);

  useEffect(() => {
    if (!editable || durationMs === null) return;
    let cancel = false;
    setWaveError(null);
    void fetch(`/api/audio/sessions/${session.id}/waveform`)
      .then(async (response) => {
        const body = (await response.json()) as { peaks?: number[]; error?: { message?: string } };
        if (cancel) return;
        if (!response.ok || !Array.isArray(body.peaks) || body.peaks.length === 0) {
          setPeaks(null);
          setWaveError(body.error?.message ?? "Không tải được dạng sóng.");
          return;
        }
        setPeaks(body.peaks);
      })
      .catch(() => {
        if (!cancel) setWaveError("Không tải được dạng sóng.");
      });
    return () => {
      cancel = true;
    };
  }, [editable, durationMs, session.id]);

  useEffect(() => {
    if (!editable) return;
    const context = new AudioContext();
    contextRef.current = context;
    let cancel = false;
    setAudioReady(false);
    setPlayError(null);
    void fetch(`/api/audio/sessions/${session.id}/stream`)
      .then(async (response) => {
        if (!response.ok) throw new Error("stream");
        const data = await response.arrayBuffer();
        const buffer = await context.decodeAudioData(data.slice(0));
        if (cancel) return;
        bufferRef.current = buffer;
        setAudioReady(true);
      })
      .catch(() => {
        if (!cancel) setPlayError("Không phát được audio.");
      });
    return () => {
      cancel = true;
      playToken.current += 1;
      stopSources();
      void context.close();
      contextRef.current = null;
      bufferRef.current = null;
    };
  }, [editable, session.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || !durationMs) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = getComputedStyle(canvas).color;
    const mid = height / 2;
    const bar = width / peaks.length;
    for (let index = 0; index < peaks.length; index += 1) {
      const barHeight = Math.max(1, (peaks[index] ?? 0) * (height - 8));
      context.fillRect(index * bar, mid - barHeight / 2, Math.max(1, bar - 1), barHeight);
    }
  }, [peaks, zoom, durationMs, edits]);

  useEffect(() => {
    if (!playing) paint(cursor);
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (event.key === " ") {
        event.preventDefault();
        if (playingRef.current) pauseRef.current();
        else void startPlayback(outputMsAtSource(editsRef.current, cursor), editsRef.current);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoRef.current();
        else undoRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  async function sendFile(file: File) {
    const token = pollToken.current + 1;
    pollToken.current = token;
    setBusy(true);
    setMessage(null);
    const timer = window.setInterval(() => {
      void fetch(`/api/audio/sessions/${session.id}/status`).then(async (response) => {
        if (pollToken.current !== token || !response.ok) return;
        const next = (await response.json()) as SessionView;
        setSession(next);
      });
    }, 400);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch(`/api/audio/sessions/${session.id}/import`, { method: "POST", body });
      const next = (await response.json()) as SessionView & { error?: { message?: string } };
      if (!response.ok) {
        setMessage(next.error?.message ?? "Không nhập được audio.");
        return;
      }
      setSession(next);
      setEdits(next.edits);
      editsRef.current = next.edits;
      setHistory([]);
      setFuture([]);
      setCursor(0);
      if (next.state === "FAILED") setMessage(errorLabels[next.errorCode ?? ""] ?? "Không nhập được audio.");
    } catch {
      setMessage("Không nhập được audio.");
    } finally {
      window.clearInterval(timer);
      pollToken.current += 1;
      setBusy(false);
    }
  }

  function beginDrag(index: number, edge: "start" | "end", event: ReactPointerEvent) {
    if (durationMs === null) return;
    event.stopPropagation();
    event.preventDefault();
    const snapshot = editsRef.current;
    const move = (pointer: PointerEvent) => {
      const surface = surfaceRef.current;
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      const ratio = rect.width === 0 ? 0 : (pointer.clientX - rect.left) / rect.width;
      const ms = ratio * durationMs;
      const current = editsRef.current.segments[index];
      if (!current) return;
      const clamped = clampSegment(
        editsRef.current.segments,
        index,
        edge === "start" ? ms : current.startMs,
        edge === "end" ? ms : current.endMs,
        durationMs,
      );
      const segments = editsRef.current.segments.map((segment, item) => (item === index ? clamped : segment));
      const next = { ...editsRef.current, segments };
      if (validateEdits(next, durationMs)) return;
      editsRef.current = next;
      setEdits(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (editsRef.current !== snapshot) {
        setHistory((stack) => [...stack, snapshot]);
        setFuture([]);
        void persist(editsRef.current);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function seek(event: ReactPointerEvent<HTMLDivElement>) {
    if (durationMs === null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width === 0 ? 0 : (event.clientX - rect.left) / rect.width;
    const source = Math.max(0, Math.min(durationMs, Math.round((ratio * durationMs) / 10) * 10));
    setCursor(source);
    paint(source);
    const index = edits.segments.findIndex((segment) => source >= segment.startMs && source <= segment.endMs);
    if (index >= 0) setSelected(index);
    if (playingRef.current) void startPlayback(outputMsAtSource(editsRef.current, source), editsRef.current);
  }

  async function exportMp3() {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setExporting(true);
    setMessage(null);
    const saved = await persist(editsRef.current);
    if (!saved) {
      setExporting(false);
      return;
    }
    const response = await fetch(`/api/audio/sessions/${session.id}/export`, { method: "POST" });
    const body = (await response.json()) as { id?: string; error?: { message?: string } };
    if (!response.ok || !body.id) {
      setMessage(body.error?.message ?? "Không xuất được file MP3.");
      setExporting(false);
      return;
    }
    setExportId(body.id);
    setExporting(false);
  }

  async function endSession() {
    await fetch(`/api/audio/sessions/${session.id}`, { method: "DELETE" });
    setExpired(true);
  }

  if (expired) {
    return (
      <section className="flex min-h-[60vh] flex-col items-start justify-center gap-4">
        <h1 className="font-serif text-h2">Phiên sửa đã hết hạn</h1>
        <p className="max-w-xl text-studio-muted">File tạm đã được xoá trên máy chủ. File bạn đã tải về máy vẫn còn ở đó.</p>
        <Link href="/tai-len" className="studio-primary">Mở phiên khác</Link>
      </section>
    );
  }

  const thumbnail = safeThumbnail(session.thumbnailUrl);
  const active = edits.segments[selected] ?? edits.segments[0];
  const kept = keptDurationMs(edits);
  const minutes = Math.max(1, Math.round((Date.parse(session.expiresAt) - Date.parse(session.lastActivityAt)) / 60000));
  const stepIndex = steps.indexOf(session.state as (typeof steps)[number]);
  const gaps: Array<{ start: number; end: number }> = [];
  if (durationMs) {
    let walked = 0;
    for (const segment of edits.segments) {
      if (segment.startMs > walked) gaps.push({ start: walked, end: segment.startMs });
      walked = Math.max(walked, segment.endMs);
    }
    if (walked < durationMs) gaps.push({ start: walked, end: durationMs });
  }
  const tickStep = !durationMs ? 1000 : durationMs > 120000 ? 30000 : durationMs > 30000 ? 5000 : 1000;
  const ticks = durationMs ? Array.from({ length: Math.floor(durationMs / tickStep) + 1 }, (_, index) => index * tickStep) : [];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/tai-len" className="inline-flex min-h-[44px] items-center gap-2 text-sm text-studio-muted">
        <ArrowLeftIcon className="h-4 w-4" />
        Về trang tải nhạc
      </Link>
      <header className="flex flex-wrap items-center gap-4">
        {thumbnail ? (
          <img src={thumbnail} alt="" className="h-20 w-36 rounded-md object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-studio-accent">{stateLabels[session.state] ?? session.state}</p>
          <h1 className="truncate font-serif text-h2">{session.title || "Bản nhạc chưa đặt tên"}</h1>
          <p className="text-studio-muted">{session.channelName || "Không có kênh"} · {durationMs ? clock(durationMs, true) : "Chưa có thời lượng audio"}</p>
        </div>
      </header>
      <p className="text-sm text-studio-muted">
        Bản này nằm ngoài thư viện. Máy chủ xoá file sau {minutes} phút không dùng. Tải lại trang không xoá phiên đang mở.
      </p>
      {session.errorCode && session.state !== "READY" ? (
        <p className="notice notice-warn"><AlertIcon /><span>{errorLabels[session.errorCode] ?? "Không nhập được audio."}</span></p>
      ) : null}
      {message ? <p className="notice notice-warn" role="status"><AlertIcon /><span>{message}</span></p> : null}
      {session.state !== "READY" && session.state !== "EXPORTING" ? (
        <ol className="grid gap-2 sm:grid-cols-4">
          {steps.map((step, index) => (
            <li
              key={step}
              className={`rounded-md border px-3 py-3 text-sm ${index <= stepIndex ? "border-studio-accent text-studio-text" : "border-studio-line text-studio-muted"}`}
              aria-current={session.state === step ? "step" : undefined}
            >
              {stateLabels[step]}
            </li>
          ))}
        </ol>
      ) : null}
      {session.state === "CREATED" || session.state === "FAILED" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const file = fileRef.current?.files?.[0];
            if (file) void sendFile(file);
          }}
        >
          <label className="studio-btn w-fit cursor-pointer" htmlFor="session-file">
            <UploadIcon />
            {busy ? "Đang nhập…" : "Tải file được phép"}
            <input
              id="session-file"
              ref={fileRef}
              className="sr-only"
              type="file"
              accept=".mp3,.wav,audio/mpeg,audio/wav"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void sendFile(file);
                event.target.value = "";
              }}
            />
          </label>
          <p className="text-sm text-studio-muted">MP3 hoặc WAV bạn có quyền sử dụng. File được chuyển thành MP3 tạm để sửa.</p>
        </form>
      ) : null}
      {editable && durationMs && active ? (
        <section className="flex min-h-[70vh] flex-col gap-4" aria-label="Trình sửa dạng sóng">
          {waveError ? <p className="notice notice-error"><AlertIcon /><span>{waveError}</span></p> : null}
          {playError ? <p className="notice notice-error"><AlertIcon /><span>{playError}</span></p> : null}
          {!peaks && !waveError ? <p className="text-sm text-studio-muted">Đang tải dạng sóng từ audio đã chuyển đổi.</p> : null}
          <div className="overflow-x-auto rounded-md border border-studio-line bg-studio-raised">
            <div style={{ width: `${zoom * 100}%`, minWidth: "100%" }}>
              <div className="relative h-8 border-b border-studio-line">
                {ticks.map((tick) => (
                  <span key={tick} className="absolute top-1 text-[11px] text-studio-muted" style={{ left: `${(tick / durationMs) * 100}%` }}>
                    {clock(tick)}
                  </span>
                ))}
              </div>
              <div ref={surfaceRef} className="relative h-56 cursor-pointer sm:h-72" onPointerDown={seek}>
                <canvas ref={canvasRef} className="h-full w-full text-studio-accent" />
                {gaps.map((gap) => (
                  <div
                    key={`${gap.start}-${gap.end}`}
                    className="pointer-events-none absolute inset-y-0 bg-black/45"
                    style={{ left: `${(gap.start / durationMs) * 100}%`, width: `${((gap.end - gap.start) / durationMs) * 100}%` }}
                  />
                ))}
                {edits.segments.map((segment, index) => (
                  <div
                    key={`${segment.startMs}-${segment.endMs}-${index}`}
                    className={`pointer-events-none absolute inset-y-0 border-x ${index === selected ? "border-studio-accent" : "border-transparent"}`}
                    style={{ left: `${(segment.startMs / durationMs) * 100}%`, width: `${((segment.endMs - segment.startMs) / durationMs) * 100}%` }}
                  >
                    <button
                      type="button"
                      className="pointer-events-auto absolute inset-y-0 left-0 w-3 cursor-ew-resize"
                      aria-label={`Kéo điểm đầu đoạn ${index + 1}`}
                      onPointerDown={(event) => beginDrag(index, "start", event)}
                    />
                    <button
                      type="button"
                      className="pointer-events-auto absolute inset-y-0 right-0 w-3 cursor-ew-resize"
                      aria-label={`Kéo điểm cuối đoạn ${index + 1}`}
                      onPointerDown={(event) => beginDrag(index, "end", event)}
                    />
                  </div>
                ))}
                <div ref={playheadRef} className="pointer-events-none absolute inset-y-0 w-0.5 bg-studio-accent" />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="studio-primary" disabled={!audioReady || !peaks} onClick={() => (playing ? pause() : void startPlayback(outputMsAtSource(edits, cursor), edits))}>
              {playing ? <PauseIcon /> : <PlayIcon />}
              {playing ? "Tạm dừng" : "Nghe"}
            </button>
            <button type="button" className="studio-btn" onClick={stop} aria-label="Dừng và về đầu">
              <StopIcon />
              Dừng
            </button>
            <span ref={timeRef} className="min-w-36 font-mono text-sm">{clock(cursor, true)} / {clock(durationMs, true)}</span>
            <label className="flex items-center gap-2 text-sm">
              <VolumeIcon />
              <span className="sr-only">Âm lượng nghe</span>
              <input
                className="studio-range w-28"
                type="range"
                min={0}
                max={100}
                value={Math.round(listen * 100)}
                onChange={(event) => {
                  const value = Number(event.target.value) / 100;
                  setListen(value);
                  if (listenGainRef.current) listenGainRef.current.gain.value = value;
                }}
              />
            </label>
            <button type="button" className="studio-btn" aria-pressed={zoom > 1} onClick={() => setZoom((value) => Math.min(8, value * 2))}>
              <ZoomInIcon />
              Phóng
            </button>
            <button type="button" className="studio-btn" disabled={zoom === 1} onClick={() => setZoom((value) => Math.max(1, value / 2))}>Thu</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="studio-btn" disabled={history.length === 0} onClick={undo}><UndoIcon />Hoàn tác</button>
            <button type="button" className="studio-btn" disabled={future.length === 0} onClick={redo}><RedoIcon />Làm lại</button>
            <button
              type="button"
              className="studio-btn"
              onClick={() => {
                const next = splitEdits(edits, cursor);
                if (!next) setMessage("Đặt điểm cắt trong một đoạn, cách mép ít nhất 0,1 giây.");
                else {
                  setMessage(null);
                  commit(next, true);
                }
              }}
            >
              <ScissorsIcon />
              Cắt tại con trỏ
            </button>
            <button
              type="button"
              className="studio-btn"
              onClick={() => {
                const nextSegment = edits.segments[selected + 1];
                if (!active || !nextSegment || active.endMs !== nextSegment.startMs) {
                  setMessage("Chỉ ghép được hai đoạn liền nhau.");
                  return;
                }
                const segments = edits.segments.flatMap((segment, index) => {
                  if (index === selected) return [{ startMs: active.startMs, endMs: nextSegment.endMs }];
                  if (index === selected + 1) return [];
                  return [segment];
                });
                setMessage(null);
                commit({ ...edits, segments }, true);
              }}
            >
              Ghép đoạn kế
            </button>
            <button
              type="button"
              className="studio-btn"
              onClick={() => {
                if (edits.segments.length < 2) {
                  setMessage("Cần giữ lại ít nhất một đoạn.");
                  return;
                }
                const segments = edits.segments.filter((_, index) => index !== selected);
                const next = { ...edits, segments };
                if (validateEdits(next, durationMs)) {
                  setMessage("Phần còn lại ngắn hơn một giây.");
                  return;
                }
                setSelected(Math.max(0, selected - 1));
                setMessage(null);
                commit(next, true);
              }}
            >
              <TrashIcon />
              Bỏ đoạn
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm">
              Đầu đoạn ({clock(active.startMs)})
              <input
                className="input"
                type="number"
                min={0}
                max={durationMs}
                step={10}
                value={active.startMs}
                onChange={(event) => {
                  const clamped = clampSegment(edits.segments, selected, Number(event.target.value), active.endMs, durationMs);
                  const segments = edits.segments.map((segment, index) => (index === selected ? clamped : segment));
                  commit({ ...edits, segments }, true);
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Cuối đoạn ({clock(active.endMs)})
              <input
                className="input"
                type="number"
                min={0}
                max={durationMs}
                step={10}
                value={active.endMs}
                onChange={(event) => {
                  const clamped = clampSegment(edits.segments, selected, active.startMs, Number(event.target.value), durationMs);
                  const segments = edits.segments.map((segment, index) => (index === selected ? clamped : segment));
                  commit({ ...edits, segments }, true);
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Fade vào (ms)
              <input
                className="input"
                type="number"
                min={0}
                max={10000}
                step={10}
                value={edits.fadeInMs}
                onChange={(event) => commit({ ...edits, fadeInMs: Math.round(Number(event.target.value) / 10) * 10 }, true)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Fade ra (ms)
              <input
                className="input"
                type="number"
                min={0}
                max={10000}
                step={10}
                value={edits.fadeOutMs}
                onChange={(event) => commit({ ...edits, fadeOutMs: Math.round(Number(event.target.value) / 10) * 10 }, true)}
              />
            </label>
          </div>
          <label className="flex max-w-sm flex-col gap-1 text-sm">
            Gain xuất ({edits.gainDb} dB)
            <input
              className="studio-range"
              type="range"
              min={-24}
              max={6}
              step={0.5}
              value={edits.gainDb}
              onChange={(event) => commit({ ...edits, gainDb: Number(event.target.value) }, true)}
            />
          </label>
          <p className="text-sm text-studio-muted">Phần giữ lại {clock(kept, true)}. Nghe, dạng sóng và file xuất dùng cùng danh sách đoạn này.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="studio-primary" disabled={exporting} onClick={() => void exportMp3()}>
              <DownloadIcon />
              {exporting ? "Đang xuất…" : "Xuất MP3"}
            </button>
            {exportId ? (
              <a className="studio-btn" href={`/api/audio/sessions/${session.id}/exports/${exportId}`}>Tải MP3</a>
            ) : null}
            <button type="button" className="studio-btn" onClick={() => void endSession()}>Kết thúc phiên</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
