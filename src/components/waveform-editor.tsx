"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ExportControl, type ExportJob } from "@/components/export-control";
import { clock } from "@/components/format";
import { newIdempotencyKey } from "@/components/idempotency-key";
import {
  AlertIcon,
  ArrowLeftIcon,
  CheckIcon,
  LoopIcon,
  PauseIcon,
  PlayIcon,
  RedoIcon,
  ResetIcon,
  StopIcon,
  UndoIcon,
  VolumeIcon,
  ZoomInIcon,
} from "@/components/icons";
import { shownPlayhead } from "@/components/playback-clock";
import { clippingWarning, REVISION_NAME_MAX, validateRevision } from "@/server/media/revision-rules";

type Revision = {
  trimStartMs: number;
  trimEndMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  gainDb: number;
};

type SavedRevision = Revision & { id: string; name: string | null };

type Drag = { kind: "start" | "end" } | { kind: "select"; anchorMs: number; anchorX: number; moved: boolean };

const ZOOMS = [1, 2, 4, 8];
const MIN_CLIP_MS = 1000;

const validationText: Record<string, string> = {
  INVALID_TIME: "Thời gian cần là số mili giây nguyên.",
  INVALID_PRECISION: "Điểm cắt cần làm tròn tới 0,01 giây.",
  INVALID_RANGE: "Điểm kết thúc phải sau điểm bắt đầu và nằm trong độ dài bài.",
  CLIP_TOO_SHORT: "Đoạn cắt cần dài ít nhất 1 giây.",
  INVALID_FADE: "Fade vào và fade ra tối đa 10 giây mỗi bên.",
  FADE_TOO_LONG: "Fade vào cộng fade ra đang dài hơn đoạn cắt.",
  INVALID_GAIN: "Gain cần nằm trong khoảng −24 dB đến +6 dB.",
};

function sameRevision(a: Revision, b: Revision) {
  return (
    a.trimStartMs === b.trimStartMs &&
    a.trimEndMs === b.trimEndMs &&
    a.fadeInMs === b.fadeInMs &&
    a.fadeOutMs === b.fadeOutMs &&
    a.gainDb === b.gainDb
  );
}

function round10(ms: number) {
  return Math.round(ms / 10) * 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function tickStep(durationMs: number, innerWidth: number) {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const step of steps) {
    if ((step * 1000 * innerWidth) / durationMs >= 88) return step;
  }
  return 600;
}

function TimeField({
  id,
  label,
  ms,
  onCommit,
  step = 0.01,
}: {
  id: string;
  label: string;
  ms: number;
  onCommit: (ms: number) => void;
  step?: number;
}) {
  const [text, setText] = useState((ms / 1000).toFixed(2));
  function commit() {
    const value = Number(text.replace(",", "."));
    if (!Number.isFinite(value)) {
      setText((ms / 1000).toFixed(2));
      return;
    }
    const next = round10(value * 1000);
    if (next !== ms) onCommit(next);
    else setText((ms / 1000).toFixed(2));
  }
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="studio-label">{label}</label>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          className="studio-input pr-14"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-studio-muted">giây</span>
      </div>
    </div>
  );
}

export function WaveformEditor({
  assetId,
  durationMs,
  initialRevision,
  initialExport,
  title,
  facts,
}: {
  assetId: string;
  durationMs: number;
  initialRevision: SavedRevision | null;
  initialExport: ExportJob | null;
  title: string;
  facts: string[];
}) {
  const maxEnd = Math.floor(durationMs / 10) * 10;
  const [baseline] = useState<Revision>(() =>
    initialRevision
      ? {
          trimStartMs: initialRevision.trimStartMs,
          trimEndMs: initialRevision.trimEndMs,
          fadeInMs: initialRevision.fadeInMs,
          fadeOutMs: initialRevision.fadeOutMs,
          gainDb: initialRevision.gainDb,
        }
      : { trimStartMs: 0, trimEndMs: Math.max(1000, Math.floor(durationMs / 10) * 10), fadeInMs: 0, fadeOutMs: 0, gainDb: 0 },
  );
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [waveError, setWaveError] = useState(false);
  const [draft, setDraft] = useState<Revision>(baseline);
  const [history, setHistory] = useState<Revision[]>([]);
  const [future, setFuture] = useState<Revision[]>([]);
  const [message, setMessage] = useState("");
  const [loop, setLoop] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedRevision | null>(initialRevision);
  const [name, setName] = useState(initialRevision?.name ?? "");
  const [nameError, setNameError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const [savedExport, setSavedExport] = useState<ExportJob | null>(initialExport);
  const [playing, setPlaying] = useState(false);
  const [listenVolume, setListenVolume] = useState(1);
  const [gesturing, setGesturing] = useState(false);
  const [cursorMs, setCursorMs] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewWidth, setViewWidth] = useState(0);
  const contextRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<Promise<AudioBuffer> | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const listenGainRef = useRef<GainNode | null>(null);
  const listenVolumeRef = useRef(1);
  const playTokenRef = useRef(0);
  const positionRef = useRef<number | null>(null);
  const loopRef = useRef(loop);
  const draftRef = useRef(draft);
  const saveKeyRef = useRef<string | null>(null);
  const gestureRef = useRef<Revision | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const playRef = useRef<{ at: number; fromMs: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const playheadTimeRef = useRef<HTMLSpanElement>(null);
  const transportTimeRef = useRef<HTMLSpanElement>(null);
  const paintRef = useRef<(ms: number | null) => void>(() => {});
  const pendingScrollRef = useRef<number | null>(null);
  const shortcutRef = useRef<(event: KeyboardEvent) => void>(() => {});
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const cursorRef = useRef<number | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/assets/${assetId}/waveform`)
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setWaveError(true);
          setPeaks([]);
          return;
        }
        const body = await response.json();
        if (!cancelled) setPeaks(body.peaks ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setWaveError(true);
          setPeaks([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const source = sourceRef.current;
      sourceRef.current = null;
      if (source) {
        source.onended = null;
        source.stop();
      }
      void contextRef.current?.close();
      contextRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(([entry]) => setViewWidth(entry.contentRect.width));
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  const nameChanged = name.trim() !== (saved?.name ?? "");
  const dirty = (saved ? !sameRevision(draft, saved) : !sameRevision(draft, baseline) || history.length > 0) || nameChanged;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const selectedPeak = useMemo(() => {
    if (!peaks || peaks.length === 0 || durationMs <= 0) return 0;
    const first = Math.max(0, Math.floor((draft.trimStartMs / durationMs) * peaks.length));
    const last = Math.min(peaks.length, Math.ceil((draft.trimEndMs / durationMs) * peaks.length));
    let max = 0;
    for (let index = first; index < last; index += 1) max = Math.max(max, peaks[index]);
    return max;
  }, [peaks, durationMs, draft.trimStartMs, draft.trimEndMs]);
  const warning = clippingWarning(draft.gainDb, selectedPeak);
  const invalid = validateRevision(draft, durationMs);

  const innerWidth = viewWidth * zoom;

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const target = pendingScrollRef.current;
    if (!scroller || target === null) return;
    pendingScrollRef.current = null;
    scroller.scrollLeft = Math.max(0, target * scroller.scrollWidth - scroller.clientWidth / 2);
  }, [zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || innerWidth <= 0) return;
    const height = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, innerWidth, height);
    if (peaks.length === 0) return;
    const styles = getComputedStyle(document.documentElement);
    const waveOff = styles.getPropertyValue("--studio-wave").trim();
    const waveOn = styles.getPropertyValue("--studio-wave-on").trim();
    const fadeShade = styles.getPropertyValue("--studio-fade").trim();
    const accent = styles.getPropertyValue("--studio-accent").trim();
    const startX = (draft.trimStartMs / durationMs) * innerWidth;
    const endX = (draft.trimEndMs / durationMs) * innerWidth;
    const mid = height / 2;
    const pitch = 3;
    const bars = Math.max(1, Math.floor(innerWidth / pitch));
    for (let bar = 0; bar < bars; bar += 1) {
      const from = Math.floor((bar / bars) * peaks.length);
      const to = Math.max(from + 1, Math.floor(((bar + 1) / bars) * peaks.length));
      let peak = 0;
      for (let index = from; index < to && index < peaks.length; index += 1) peak = Math.max(peak, peaks[index]);
      const x = bar * pitch;
      const half = Math.max(1, peak * (height * 0.44));
      context.fillStyle = x >= startX && x <= endX ? waveOn : waveOff;
      context.fillRect(x, mid - half, 2, half * 2);
    }
    const fadeInX = startX + (draft.fadeInMs / durationMs) * innerWidth;
    const fadeOutX = endX - (draft.fadeOutMs / durationMs) * innerWidth;
    context.fillStyle = fadeShade;
    if (draft.fadeInMs > 0) {
      context.beginPath();
      context.moveTo(startX, 0);
      context.lineTo(fadeInX, 0);
      context.lineTo(startX, height);
      context.closePath();
      context.fill();
    }
    if (draft.fadeOutMs > 0) {
      context.beginPath();
      context.moveTo(fadeOutX, 0);
      context.lineTo(endX, 0);
      context.lineTo(endX, height);
      context.closePath();
      context.fill();
    }
    context.strokeStyle = accent;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(startX, draft.fadeInMs > 0 ? height : 1);
    context.lineTo(fadeInX, 1);
    context.lineTo(fadeOutX, 1);
    context.lineTo(endX, draft.fadeOutMs > 0 ? height : 1);
    context.stroke();
  }, [peaks, innerWidth, durationMs, draft.trimStartMs, draft.trimEndMs, draft.fadeInMs, draft.fadeOutMs]);

  function commitHistory(origin: Revision) {
    setHistory((current) => [...current, origin]);
    setFuture([]);
  }

  function update(next: Revision) {
    commitHistory(draft);
    setDraft(next);
    draftRef.current = next;
    saveKeyRef.current = null;
  }

  function live(next: Revision) {
    if (!gestureRef.current) {
      gestureRef.current = draftRef.current;
      setGesturing(true);
    }
    draftRef.current = next;
    setDraft(next);
    saveKeyRef.current = null;
  }

  function endGesture() {
    const origin = gestureRef.current;
    gestureRef.current = null;
    setGesturing(false);
    if (origin && !sameRevision(origin, draftRef.current)) commitHistory(origin);
  }

  function undo() {
    const previous = history[history.length - 1];
    if (!previous) return;
    setFuture((current) => [draft, ...current]);
    setHistory((current) => current.slice(0, -1));
    setDraft(previous);
    draftRef.current = previous;
    saveKeyRef.current = null;
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setHistory((current) => [...current, draft]);
    setFuture((current) => current.slice(1));
    setDraft(next);
    draftRef.current = next;
    saveKeyRef.current = null;
  }

  function audioContext() {
    contextRef.current ??= new AudioContext();
    return contextRef.current;
  }

  function loadBuffer(context: AudioContext) {
    bufferRef.current ??= fetch(`/api/assets/${assetId}/audio`).then(async (response) => {
      if (!response.ok) throw new Error("AUDIO_UNAVAILABLE");
      return context.decodeAudioData(await response.arrayBuffer());
    });
    bufferRef.current.catch(() => {
      bufferRef.current = null;
    });
    return bufferRef.current;
  }

  const paintPlayhead = useCallback(
    (ms: number | null) => {
      const display = shownPlayhead(ms, cursorRef.current, draftRef.current.trimStartMs);
      positionRef.current = ms ?? cursorRef.current;
      const parked = ms === null && cursorRef.current === null;
      const head = playheadRef.current;
      if (head) {
        head.style.opacity = parked ? "0" : "1";
        head.style.left = `${(display / durationMs) * 100}%`;
        if (playheadTimeRef.current) playheadTimeRef.current.textContent = parked ? "" : clock(display, true);
      }
      if (transportTimeRef.current) {
        transportTimeRef.current.textContent = `${clock(display, true)} / ${clock(durationMs, true)}`;
      }
    },
    [durationMs],
  );

  useLayoutEffect(() => {
    paintRef.current = paintPlayhead;
  });

  useLayoutEffect(() => {
    if (!playing) cursorRef.current = cursorMs;
    paintRef.current(playing ? positionRef.current : cursorMs);
  });

  function stopTicker() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    playRef.current = null;
  }

  function invalidatePlayback() {
    playTokenRef.current += 1;
    const source = sourceRef.current;
    sourceRef.current = null;
    listenGainRef.current = null;
    stopTicker();
    if (!source) return;
    source.onended = null;
    try {
      source.stop();
    } catch {
      return;
    }
  }

  function pause() {
    const ms = positionRef.current;
    invalidatePlayback();
    setPlaying(false);
    if (ms !== null) {
      cursorRef.current = ms;
      setCursorMs(ms);
      paintRef.current(ms);
    }
  }

  function stop() {
    invalidatePlayback();
    cursorRef.current = null;
    positionRef.current = null;
    setCursorMs(null);
    setPlaying(false);
    paintRef.current(null);
  }

  async function play(fromMs?: number) {
    invalidatePlayback();
    const gen = playTokenRef.current;
    const context = audioContext();
    if (context.state === "suspended") await context.resume();
    if (gen !== playTokenRef.current) return;
    let buffer: AudioBuffer;
    try {
      buffer = await loadBuffer(context);
    } catch {
      if (gen === playTokenRef.current) {
        setPlaying(false);
        setMessage("Không tải được âm thanh để nghe thử.");
      }
      return;
    }
    if (gen !== playTokenRef.current) return;
    const current = draftRef.current;
    const startFrom = clamp(fromMs ?? current.trimStartMs, current.trimStartMs, Math.max(current.trimStartMs, current.trimEndMs - 10));
    const clip = Math.max(0.01, (current.trimEndMs - current.trimStartMs) / 1000);
    const offset = (startFrom - current.trimStartMs) / 1000;
    const remaining = Math.max(0.01, clip - offset);
    const amp = 10 ** (current.gainDb / 20);
    const fadeIn = current.fadeInMs / 1000;
    const fadeOut = current.fadeOutMs / 1000;
    const envelope = (t: number) => {
      let value = amp;
      if (fadeIn > 0 && t < fadeIn) value = amp * (t / fadeIn);
      if (fadeOut > 0 && t > clip - fadeOut) value = Math.min(value, amp * ((clip - t) / fadeOut));
      return Math.max(0.0001, value);
    };
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    const listen = context.createGain();
    listen.gain.value = listenVolumeRef.current;
    const now = context.currentTime;
    gain.gain.setValueAtTime(envelope(offset), now);
    if (fadeIn > 0 && offset < fadeIn) gain.gain.linearRampToValueAtTime(envelope(fadeIn), now + (fadeIn - offset));
    const fadeOutStart = clip - fadeOut;
    if (fadeOut > 0 && fadeOutStart > offset) gain.gain.setValueAtTime(envelope(fadeOutStart), now + (fadeOutStart - offset));
    if (fadeOut > 0) gain.gain.linearRampToValueAtTime(0.0001, now + remaining);
    source.connect(gain);
    gain.connect(listen);
    listen.connect(context.destination);
    source.onended = () => {
      if (sourceRef.current !== source) return;
      sourceRef.current = null;
      listenGainRef.current = null;
      if (loopRef.current) {
        void play();
        return;
      }
      stopTicker();
      setPlaying(false);
      const end = draftRef.current.trimEndMs;
      cursorRef.current = end;
      positionRef.current = end;
      setCursorMs(end);
      paintRef.current(end);
    };
    if (gen !== playTokenRef.current) return;
    source.start(now, startFrom / 1000, remaining);
    sourceRef.current = source;
    listenGainRef.current = listen;
    playRef.current = { at: now, fromMs: startFrom };
    positionRef.current = startFrom;
    setPlaying(true);
    setMessage("");
    const tick = () => {
      const state = playRef.current;
      const ctx = contextRef.current;
      if (!state || !ctx) return;
      paintRef.current(state.fromMs + (ctx.currentTime - state.at) * 1000);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function togglePlay() {
    if (playing) pause();
    else {
      const cursor = cursorRef.current;
      const current = draftRef.current;
      const inside = cursor !== null && cursor > current.trimStartMs && cursor < current.trimEndMs - 10;
      void play(inside ? cursor : undefined);
    }
  }

  function onListenVolume(value: number) {
    listenVolumeRef.current = value;
    setListenVolume(value);
    const node = listenGainRef.current;
    if (node) node.gain.value = value;
  }

  async function save() {
    if (!name.trim()) {
      setNameError(true);
      nameRef.current?.focus();
      return;
    }
    if (saving || invalid) return;
    setSaving(true);
    setMessage("");
    saveKeyRef.current ??= newIdempotencyKey();
    try {
      const response = await fetch(`/api/assets/${assetId}/revisions`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": saveKeyRef.current },
        body: JSON.stringify({ ...draft, name: name.trim() }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error?.message ?? "Không lưu được.");
        return;
      }
      setSaved({ ...draft, id: body.id, name: body.name ?? null });
      setSavedExport(null);
      setMessage(
        body.name
          ? `Đã lưu bản chỉnh “${body.name}”. Bạn có thể xuất MP3 ngay.`
          : "Đã lưu bản chỉnh mới. Bạn có thể xuất MP3 ngay.",
      );
      window.history.replaceState(null, "", `/bien-tap/${assetId}?revisionId=${body.id}`);
    } catch {
      setMessage("Không lưu được. Hãy thử lại.");
    } finally {
      setSaving(false);
    }
  }

  function msAt(clientX: number) {
    const inner = innerRef.current;
    if (!inner) return 0;
    const rect = inner.getBoundingClientRect();
    return round10(clamp(((clientX - rect.left) / rect.width) * durationMs, 0, maxEnd));
  }

  function moveHandle(kind: "start" | "end", ms: number, commit: boolean) {
    const current = draftRef.current;
    const next =
      kind === "start"
        ? { ...current, trimStartMs: clamp(ms, 0, current.trimEndMs - MIN_CLIP_MS) }
        : { ...current, trimEndMs: clamp(ms, current.trimStartMs + MIN_CLIP_MS, maxEnd) };
    if (sameRevision(next, current)) return;
    if (commit) update(next);
    else live(next);
  }

  function setZoomAround(next: number, centerFraction?: number) {
    const scroller = scrollerRef.current;
    if (scroller && scroller.scrollWidth > 0) {
      pendingScrollRef.current = centerFraction ?? (scroller.scrollLeft + scroller.clientWidth / 2) / scroller.scrollWidth;
    }
    setZoom(next);
  }

  function zoomToSelection() {
    const fraction = (draft.trimEndMs - draft.trimStartMs) / durationMs;
    let best = 1;
    for (const level of ZOOMS) if (fraction * level <= 0.85) best = level;
    setZoomAround(best, (draft.trimStartMs + draft.trimEndMs) / 2 / durationMs);
  }

  const onShortcut = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const inField = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (inField) {
        target?.blur();
        requestAnimationFrame(() => void saveRef.current());
      } else {
        void save();
      }
      return;
    }
    if (inField) return;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (mod || event.altKey) return;
    if (event.key === " " && !target?.closest("button, a")) {
      event.preventDefault();
      if (event.repeat) return;
      togglePlay();
      return;
    }
    if (event.key.toLowerCase() === "l") {
      loopRef.current = !loopRef.current;
      setLoop(loopRef.current);
    }
  };

  useLayoutEffect(() => {
    shortcutRef.current = onShortcut;
    saveRef.current = save;
    if (!playing) cursorRef.current = cursorMs;
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => shortcutRef.current(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const startPct = (draft.trimStartMs / durationMs) * 100;
  const endPct = (draft.trimEndMs / durationMs) * 100;
  const clipMs = draft.trimEndMs - draft.trimStartMs;
  const step = innerWidth > 0 ? tickStep(durationMs, innerWidth) : 10;
  const ticks: number[] = [];
  const lastTickMs = durationMs - (innerWidth > 0 ? (40 / innerWidth) * durationMs : 0);
  for (let second = 0; second * 1000 <= lastTickMs; second += step) ticks.push(second * 1000);

  const status = dirty
    ? { className: "chip-warn", icon: <AlertIcon />, label: saved ? "Có thay đổi chưa lưu" : "Bản chỉnh chưa lưu" }
    : saved
      ? { className: "chip-ok", icon: <CheckIcon />, label: "Đã lưu bản chỉnh" }
      : { className: "", icon: null, label: "Chưa có bản chỉnh" };

  function handleKeys(kind: "start" | "end") {
    return (event: React.KeyboardEvent) => {
      const value = kind === "start" ? draft.trimStartMs : draft.trimEndMs;
      const delta = event.shiftKey ? 1000 : 100;
      let next: number | null = null;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = value - delta;
      if (event.key === "ArrowRight" || event.key === "ArrowUp") next = value + delta;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = maxEnd;
      if (next === null) return;
      event.preventDefault();
      moveHandle(kind, next, true);
    };
  }

  function handlePointerDown(kind: "start" | "end") {
    return (event: React.PointerEvent) => {
      event.stopPropagation();
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      (event.currentTarget as HTMLElement).focus();
      dragRef.current = { kind };
    };
  }

  function onSurfaceDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { kind: "select", anchorMs: msAt(event.clientX), anchorX: event.clientX, moved: false };
  }

  function onPointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const ms = msAt(event.clientX);
    if (drag.kind !== "select") {
      moveHandle(drag.kind, ms, false);
      return;
    }
    if (!drag.moved && Math.abs(event.clientX - drag.anchorX) < 5) return;
    drag.moved = true;
    const current = draftRef.current;
    const lo = Math.min(drag.anchorMs, ms);
    const hi = Math.max(drag.anchorMs, ms);
    live({ ...current, trimStartMs: lo, trimEndMs: Math.max(hi, lo + 10) });
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.kind === "select" && !drag.moved) {
      cursorRef.current = drag.anchorMs;
      setCursorMs(drag.anchorMs);
      const current = draftRef.current;
      const inside = drag.anchorMs >= current.trimStartMs && drag.anchorMs < current.trimEndMs - 10;
      if (playing && inside) {
        void play(drag.anchorMs);
        return;
      }
      if (playing) {
        invalidatePlayback();
        setPlaying(false);
      }
      paintPlayhead(drag.anchorMs);
      return;
    }
    if (drag.kind === "select") {
      const current = draftRef.current;
      if (current.trimEndMs - current.trimStartMs < MIN_CLIP_MS) {
        const end = Math.min(maxEnd, current.trimStartMs + MIN_CLIP_MS);
        live({ ...current, trimStartMs: Math.max(0, end - MIN_CLIP_MS), trimEndMs: end });
      }
    }
    endGesture();
  }

  function onPointerCancel() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const origin = gestureRef.current;
    gestureRef.current = null;
    setGesturing(false);
    if (!origin) return;
    draftRef.current = origin;
    setDraft(origin);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <Link href="/thu-vien" className="mb-3 inline-flex min-h-[44px] items-center gap-2 text-sm text-studio-muted no-underline hover:text-studio-text">
            <ArrowLeftIcon className="h-4 w-4" />
            Về thư viện
          </Link>
          <p className="studio-label">Trình sửa nhạc</p>
          <h1 className="mt-1 break-words font-serif text-h1 font-normal">{title}</h1>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-studio-muted">
            {facts.map((fact) => <span key={fact}>{fact}</span>)}
            <span className="tnum">Dài {clock(durationMs, true)}</span>
          </p>
        </div>
        <form
          className="flex flex-wrap items-end gap-3 max-sm:w-full"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <span className={`chip ${status.className} ${status.className ? "" : "bg-studio-raised text-studio-muted"}`} role="status">
            {status.icon}
            {status.label}
          </span>
          <div className="flex flex-col gap-2 max-sm:w-full">
            <label htmlFor="revision-name" className="studio-label">Tên bản chỉnh</label>
            <div className="relative max-sm:w-full">
              <input
                ref={nameRef}
                id="revision-name"
                type="text"
                value={name}
                maxLength={REVISION_NAME_MAX}
                autoComplete="off"
                aria-required="true"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "revision-name-error" : undefined}
                placeholder={nameError ? undefined : "Ví dụ: Bản vào lễ, bỏ đoạn đầu"}
                onChange={(event) => {
                  setName(event.target.value);
                  if (event.target.value.trim()) setNameError(false);
                  saveKeyRef.current = null;
                }}
                className="studio-input w-72 max-sm:w-full"
              />
              {nameError ? (
                <p id="revision-name-error" role="alert" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-studio-accent">
                  Cần nhập tên bản chỉnh.
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="submit"
            disabled={saving || Boolean(invalid)}
            aria-busy={saving}
            className="studio-primary max-sm:w-full"
          >
            <CheckIcon />
            {saving ? "Đang lưu…" : "Lưu bản mới"}
          </button>
        </form>
      </div>

      <section aria-label="Dạng sóng và điểm cắt" className="overflow-hidden rounded-lg border border-studio-line bg-studio-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-line px-4 py-3">
          <dl className="tnum flex flex-wrap gap-x-6 gap-y-1">
            <div className="flex items-baseline gap-2"><dt className="studio-label">Bắt đầu</dt><dd className="text-base">{clock(draft.trimStartMs, true)}</dd></div>
            <div className="flex items-baseline gap-2"><dt className="studio-label">Kết thúc</dt><dd className="text-base">{clock(draft.trimEndMs, true)}</dd></div>
            <div className="flex items-baseline gap-2"><dt className="studio-label">Độ dài đoạn</dt><dd className="text-base text-studio-accent">{clock(clipMs, true)}</dd></div>
          </dl>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Thu phóng dạng sóng">
            <ZoomInIcon className="h-5 w-5 text-studio-muted" />
            {ZOOMS.map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={zoom === level}
                className="studio-btn min-w-[44px] px-3"
                onClick={() => setZoomAround(level)}
              >
                {level}×
              </button>
            ))}
            <button type="button" className="studio-btn" onClick={zoomToSelection}>Vừa đoạn chọn</button>
          </div>
        </div>

        <div ref={scrollerRef} className="overflow-x-auto overscroll-x-contain">
          <div ref={innerRef} className="relative select-none" style={{ width: zoom === 1 ? "100%" : `${zoom * 100}%` }}>
            <div className="relative h-7 border-b border-studio-line" aria-hidden="true">
              {ticks.map((ms) => (
                <span key={ms} className="tnum absolute top-0 flex h-full items-end pb-1 pl-1.5 text-label text-studio-muted" style={{ left: `${(ms / durationMs) * 100}%` }}>
                  <span className="absolute bottom-0 left-0 h-2 w-px bg-studio-line" />
                  {clock(ms)}
                </span>
              ))}
            </div>
            <div
              className="relative h-60 cursor-crosshair touch-pan-x max-lg:h-52 max-md:h-40"
              onPointerDown={onSurfaceDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
            >
              <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
              {peaks === null ? (
                <div className="absolute inset-0 flex items-center px-4" aria-hidden="true">
                  <span className="h-16 w-full animate-pulse rounded-sm bg-studio-raised" />
                </div>
              ) : null}
              <div
                className="pointer-events-none absolute inset-y-0 border-x border-studio-accent bg-[var(--studio-region)]"
                style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
                aria-hidden="true"
              />
              {(["start", "end"] as const).map((kind) => {
                const value = kind === "start" ? draft.trimStartMs : draft.trimEndMs;
                const pct = kind === "start" ? startPct : endPct;
                return (
                  <div
                    key={kind}
                    role="slider"
                    tabIndex={0}
                    aria-label={kind === "start" ? "Điểm bắt đầu đoạn cắt" : "Điểm kết thúc đoạn cắt"}
                    aria-valuemin={kind === "start" ? 0 : draft.trimStartMs + MIN_CLIP_MS}
                    aria-valuemax={kind === "start" ? draft.trimEndMs - MIN_CLIP_MS : maxEnd}
                    aria-valuenow={value}
                    aria-valuetext={clock(value, true)}
                    onKeyDown={handleKeys(kind)}
                    onPointerDown={handlePointerDown(kind)}
                    className="group absolute inset-y-0 z-10 flex w-11 -translate-x-1/2 cursor-ew-resize touch-none justify-center outline-none"
                    style={{ left: `${pct}%` }}
                  >
                    <span className="h-full w-0.5 bg-studio-accent" />
                    <span
                      className={`absolute top-1/2 flex h-10 w-4 -translate-y-1/2 items-center justify-center rounded-full bg-studio-accent shadow-[0_0_0_3px_var(--studio-panel)] transition-transform group-hover:scale-110 group-focus-visible:shadow-[0_0_0_3px_var(--studio-panel),0_0_0_5px_var(--studio-text)]`}
                    >
                      <span className="h-4 w-px bg-studio-bg" />
                    </span>
                  </div>
                );
              })}
              <div
                ref={playheadRef}
                className="pointer-events-none absolute inset-y-0 z-20 w-0.5 -translate-x-1/2 bg-studio-text"
                style={{ left: cursorMs === null ? "0%" : `${(cursorMs / durationMs) * 100}%`, opacity: cursorMs === null ? 0 : 1 }}
                aria-hidden="true"
              >
                <span ref={playheadTimeRef} className="tnum absolute -top-px left-1 whitespace-nowrap rounded-sm bg-studio-text px-1.5 text-label text-studio-bg">
                  {cursorMs === null ? "" : clock(cursorMs, true)}
                </span>
              </div>
              {waveError ? (
                <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-studio-muted">
                  Chưa có dạng sóng cho file này. Bạn vẫn có thể nhập điểm cắt bằng số.
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <p className="sr-only" aria-live="polite">
          {gesturing ? null : `Đoạn chọn từ ${clock(draft.trimStartMs, true)} đến ${clock(draft.trimEndMs, true)}, dài ${clock(clipMs, true)}.`}
        </p>

        <div className="flex flex-wrap items-center gap-3 border-t border-studio-line px-4 py-4">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Tạm dừng" : "Nghe đoạn"}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-studio-text text-studio-bg transition-colors hover:bg-white"
          >
            {playing ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-7 w-7" />}
          </button>
          <div className="mr-2 flex flex-col">
            <span className="studio-label">{playing ? "Đang nghe" : cursorMs !== null ? "Con trỏ" : "Nghe từ"}</span>
            <span ref={transportTimeRef} className="tnum text-h3 leading-none" />
          </div>
          <button type="button" className="studio-btn" onClick={stop} aria-label="Dừng và về đầu đoạn">
            <StopIcon />
            Dừng
          </button>
          <label className="flex min-h-[44px] items-center gap-2" htmlFor="listen-volume">
            <VolumeIcon className="h-[18px] w-[18px] text-studio-muted" />
            <span className="sr-only">Âm lượng nghe</span>
            <input
              id="listen-volume"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={listenVolume}
              aria-valuetext={`${Math.round(listenVolume * 100)}%`}
              className="studio-range w-24"
              onChange={(event) => onListenVolume(Number(event.target.value))}
            />
            <span className="tnum w-10 text-left">{Math.round(listenVolume * 100)}%</span>
          </label>
          <button
            type="button"
            aria-pressed={loop}
            className="studio-btn"
            onClick={() => {
              loopRef.current = !loop;
              setLoop(!loop);
            }}
          >
            <LoopIcon />
            Lặp đoạn
          </button>
          <span className="mx-1 hidden h-8 w-px bg-studio-line sm:block" aria-hidden="true" />
          <button type="button" className="studio-btn" disabled={history.length === 0} onClick={undo}>
            <UndoIcon />
            Hoàn tác
          </button>
          <button type="button" className="studio-btn" disabled={future.length === 0} onClick={redo}>
            <RedoIcon />
            Làm lại
          </button>
          <button type="button" className="studio-btn" disabled={sameRevision(draft, baseline)} onClick={() => update(baseline)}>
            <ResetIcon />
            Đặt lại
          </button>
          <p className="ml-auto text-sm text-studio-muted max-lg:hidden">
            Phím tắt: Space nghe/tạm dừng · L lặp · Ctrl+Z hoàn tác · Ctrl+S lưu
          </p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <fieldset className="rounded-md border border-studio-line bg-studio-panel p-4">
          <legend className="sr-only">Đoạn cắt</legend>
          <p className="mb-4 font-serif text-h3" aria-hidden="true">Đoạn cắt</p>
          <div className="grid grid-cols-2 gap-4">
            <TimeField key={`s${draft.trimStartMs}`} id="trim-start" label="Bắt đầu" ms={draft.trimStartMs} onCommit={(ms) => update({ ...draft, trimStartMs: ms })} />
            <TimeField key={`e${draft.trimEndMs}`} id="trim-end" label="Kết thúc" ms={draft.trimEndMs} onCommit={(ms) => update({ ...draft, trimEndMs: ms })} />
          </div>
          <p className="mt-3 text-sm text-studio-muted">Kéo hai tay nắm trên dạng sóng, hoặc chọn tay nắm rồi dùng phím mũi tên (giữ Shift để nhảy 1 giây).</p>
        </fieldset>
        <fieldset className="rounded-md border border-studio-line bg-studio-panel p-4">
          <legend className="sr-only">Fade</legend>
          <p className="mb-4 font-serif text-h3" aria-hidden="true">Fade</p>
          <div className="grid grid-cols-2 gap-4">
            <TimeField key={`fi${draft.fadeInMs}`} id="fade-in" label="Fade vào" ms={draft.fadeInMs} step={0.1} onCommit={(ms) => update({ ...draft, fadeInMs: ms })} />
            <TimeField key={`fo${draft.fadeOutMs}`} id="fade-out" label="Fade ra" ms={draft.fadeOutMs} step={0.1} onCommit={(ms) => update({ ...draft, fadeOutMs: ms })} />
          </div>
          <p className="mt-3 text-sm text-studio-muted">Phần tô sẫm trên dạng sóng là đoạn âm lượng tăng dần và giảm dần.</p>
        </fieldset>
        <fieldset className="rounded-md border border-studio-line bg-studio-panel p-4">
          <legend className="sr-only">Gain</legend>
          <div className="mb-4 flex items-baseline justify-between">
            <p className="font-serif text-h3" aria-hidden="true">Gain</p>
            <span className="tnum text-base">{draft.gainDb > 0 ? "+" : ""}{draft.gainDb} dB</span>
          </div>
          <label htmlFor="gain-range" className="studio-label">Gain (−24 đến +6 dB)</label>
          <input
            id="gain-range"
            type="range"
            min={-24}
            max={6}
            step={0.5}
            value={draft.gainDb}
            aria-valuetext={`${draft.gainDb} dB`}
            className="studio-range mt-1 w-full"
            onChange={(event) => live({ ...draftRef.current, gainDb: Number(event.target.value) })}
            onPointerUp={endGesture}
            onKeyUp={endGesture}
            onBlur={endGesture}
          />
          <div className="mt-2 flex items-center gap-3">
            <label htmlFor="gain-db" className="studio-label shrink-0">Nhập số</label>
            <input
              id="gain-db"
              type="number"
              step={0.5}
              min={-24}
              max={6}
              value={draft.gainDb}
              onChange={(event) => update({ ...draft, gainDb: Number(event.target.value) })}
              className="studio-input max-w-[120px]"
            />
          </div>
          {warning ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-studio-accent" role="status">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              Mức gain này làm đỉnh sóng vượt ngưỡng, tiếng có thể bị méo.
            </p>
          ) : null}
        </fieldset>
      </div>

      {invalid ? (
        <p className="flex items-start gap-2 rounded-sm border border-studio-accent px-4 py-3 text-base text-studio-accent" role="alert">
          <AlertIcon className="mt-1 h-4 w-4 shrink-0" />
          {validationText[invalid] ?? "Bản chỉnh chưa hợp lệ."} Chưa thể lưu.
        </p>
      ) : null}
      {message ? (
        <p className="text-base text-studio-text" role="status">{message}</p>
      ) : null}

      <section aria-labelledby="export-title" className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-studio-line bg-studio-panel p-4">
        <div>
          <h2 id="export-title" className="font-serif text-h3">Xuất MP3</h2>
          <p className="mt-1 text-sm text-studio-muted">
            {saved
              ? dirty
                ? "Bản đang sửa khác bản đã lưu. Xuất MP3 dùng bản đã lưu."
                : `Bản chỉnh đã lưu · ${clock(saved.trimStartMs, true)} → ${clock(saved.trimEndMs, true)}`
              : "Lưu bản chỉnh trước, rồi xuất MP3 từ bản đó."}
          </p>
        </div>
        {saved ? <ExportControl key={saved.id} revisionId={saved.id} initial={savedExport} tone="studio" /> : null}
      </section>
    </div>
  );
}
