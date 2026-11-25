"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { claimPlayback, releasePlayback } from "@/components/audio-player";
import { clock } from "@/components/format";
import { AlertIcon, PauseIcon, PlayIcon } from "@/components/icons";

export function TrackPreview({ trackId, title }: { trackId: string; title: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const id = useId();
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    const audio = ref.current;
    return () => {
      if (audio) releasePlayback(audio);
    };
  }, []);

  async function toggle() {
    const audio = ref.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    setFailed(false);
    setLoading(true);
    try {
      await audio.play();
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  const progress = duration ? Math.min(100, (current / duration) * 100) : 0;
  const started = playing || current > 0;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <audio
        ref={ref}
        src={`/api/catalog/tracks/${trackId}/preview`}
        preload="none"
        className="hidden"
        onPlay={(event) => {
          claimPlayback(event.currentTarget);
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          setDuration(Number.isFinite(value) ? value : null);
        }}
        onDurationChange={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value)) setDuration(value);
        }}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onError={() => {
          setPlaying(false);
          setLoading(false);
          setFailed(true);
        }}
      />
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={`${playing ? "Tạm dừng" : "Nghe thử"} ${title}`}
        aria-busy={loading}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-wine text-white transition-colors hover:bg-wine-deep"
      >
        {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
      </button>
      {started ? (
        <div className="flex min-w-0 items-center gap-2">
          <label className="sr-only" htmlFor={`${id}-seek`}>Vị trí phát {title}</label>
          <input
            id={`${id}-seek`}
            type="range"
            className="range w-24 max-sm:w-20"
            min={0}
            max={duration ?? 0}
            step={0.1}
            value={current}
            disabled={!duration}
            aria-valuetext={`${clock(current * 1000)} trên ${clock(duration === null ? null : duration * 1000)}`}
            style={{ "--fill": `${progress}%` } as CSSProperties}
            onChange={(event) => {
              const audio = ref.current;
              const value = Number(event.target.value);
              if (audio) audio.currentTime = value;
              setCurrent(value);
            }}
          />
          <span className="tnum w-10 shrink-0 text-sm text-muted">{clock(current * 1000)}</span>
        </div>
      ) : null}
      {failed ? (
        <span role="alert" className="flex items-center gap-1 text-sm text-danger">
          <AlertIcon className="h-4 w-4" />
          Không phát được
        </span>
      ) : null}
    </div>
  );
}
