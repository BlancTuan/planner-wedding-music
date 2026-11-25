"use client";

import { useEffect, useId, useRef, useState } from "react";
import { clock } from "@/components/format";
import { AlertIcon, PauseIcon, PlayIcon, VolumeIcon } from "@/components/icons";

let active: HTMLAudioElement | null = null;

export function claimPlayback(audio: HTMLAudioElement) {
  if (active && active !== audio) active.pause();
  active = audio;
}

export function releasePlayback(audio: HTMLAudioElement) {
  if (active === audio) active = null;
}

export function AudioPlayer({ src, label, name, compact = false }: { src: string; label: string; name?: string; compact?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const id = useId();
  const [message, setMessage] = useState("");
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const audio = ref.current;
    return () => {
      if (audio && active === audio) active = null;
    };
  }, []);

  async function toggle() {
    const audio = ref.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    setMessage("");
    setLoading(true);
    try {
      await audio.play();
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") setMessage("Không phát được file nghe.");
    } finally {
      setLoading(false);
    }
  }

  const progress = duration ? Math.min(100, (current / duration) * 100) : 0;
  const durationMs = duration === null ? null : duration * 1000;

  return (
    <div className={compact ? "flex flex-col gap-2" : "panel flex flex-col gap-4"}>
      {label ? <p className={compact ? "text-sm text-muted" : "text-base text-muted"}>{label}</p> : null}
      <audio
        ref={ref}
        src={src}
        preload="none"
        className="hidden"
        onPlay={(event) => {
          if (active && active !== event.currentTarget) active.pause();
          active = event.currentTarget;
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
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
          setMessage("Không phát được file nghe.");
        }}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => void toggle()}
          aria-label={`${playing ? "Tạm dừng" : "Phát"}${name ? ` ${name}` : ""}`}
          aria-busy={loading}
          className={`flex shrink-0 items-center justify-center rounded-full bg-wine text-white transition-colors hover:bg-wine-deep ${compact ? "h-11 w-11" : "h-14 w-14"}`}
        >
          {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className={compact ? "h-5 w-5" : "h-6 w-6"} />}
        </button>
        <div className="flex min-w-[180px] flex-1 items-center gap-3">
          <span className="tnum w-12 shrink-0 text-right text-sm text-muted">{clock(current * 1000)}</span>
          <label className="sr-only" htmlFor={`${id}-seek`}>Vị trí phát</label>
          <input
            id={`${id}-seek`}
            type="range"
            className="range flex-1"
            min={0}
            max={duration ?? 0}
            step={0.1}
            value={current}
            disabled={!duration}
            aria-valuetext={`${clock(current * 1000)} trên ${clock(durationMs)}`}
            style={{ "--fill": `${progress}%` } as React.CSSProperties}
            onChange={(event) => {
              const audio = ref.current;
              const value = Number(event.target.value);
              if (audio) audio.currentTime = value;
              setCurrent(value);
            }}
          />
          <span className="tnum w-12 shrink-0 text-sm text-muted">{clock(durationMs)}</span>
        </div>
        {(
          <div className={`flex items-center gap-2 max-sm:w-full ${compact ? "w-28" : "w-36"}`}>
            <VolumeIcon className="h-5 w-5 shrink-0 text-muted" />
            <label className="sr-only" htmlFor={`${id}-volume`}>Âm lượng nghe thử</label>
            <input
              id={`${id}-volume`}
              type="range"
              className="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              aria-valuetext={`${Math.round(volume * 100)}%`}
              style={{ "--fill": `${volume * 100}%` } as React.CSSProperties}
              onChange={(event) => {
                const value = Number(event.target.value);
                setVolume(value);
                if (ref.current) ref.current.volume = value;
              }}
            />
          </div>
        )}
      </div>
      {message ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-danger">
          <AlertIcon className="h-4 w-4" />
          {message}
        </p>
      ) : null}
    </div>
  );
}
