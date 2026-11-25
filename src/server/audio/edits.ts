export type AudioSegment = { startMs: number; endMs: number };

export type AudioEdits = {
  segments: AudioSegment[];
  fadeInMs: number;
  fadeOutMs: number;
  gainDb: number;
};

export function fullSongEdits(durationMs: number): AudioEdits {
  const end = Math.floor(durationMs / 10) * 10;
  return {
    segments: [{ startMs: 0, endMs: Math.max(1000, end) }],
    fadeInMs: 0,
    fadeOutMs: 0,
    gainDb: 0,
  };
}

export function keptDurationMs(edits: AudioEdits): number {
  return edits.segments.reduce((sum, segment) => sum + (segment.endMs - segment.startMs), 0);
}

export function validateEdits(edits: AudioEdits, durationMs: number): string | null {
  if (!Array.isArray(edits.segments) || edits.segments.length === 0 || edits.segments.length > 24) return "INVALID_RANGE";
  for (const segment of edits.segments) {
    if (!Number.isInteger(segment.startMs) || !Number.isInteger(segment.endMs)) return "INVALID_TIME";
    if (segment.startMs % 10 !== 0 || segment.endMs % 10 !== 0) return "INVALID_PRECISION";
    if (segment.startMs < 0 || segment.endMs > durationMs || segment.startMs >= segment.endMs) return "INVALID_RANGE";
    if (segment.endMs - segment.startMs < 100) return "CLIP_TOO_SHORT";
  }
  if (keptDurationMs(edits) < 1000) return "CLIP_TOO_SHORT";
  if (!Number.isInteger(edits.fadeInMs) || !Number.isInteger(edits.fadeOutMs)) return "INVALID_TIME";
  if (edits.fadeInMs < 0 || edits.fadeOutMs < 0 || edits.fadeInMs > 10000 || edits.fadeOutMs > 10000) {
    return "INVALID_FADE";
  }
  if (edits.fadeInMs + edits.fadeOutMs > keptDurationMs(edits)) return "FADE_TOO_LONG";
  if (!Number.isFinite(edits.gainDb) || edits.gainDb < -24 || edits.gainDb > 6) return "INVALID_GAIN";
  return null;
}

export function splitEdits(edits: AudioEdits, atMs: number): AudioEdits | null {
  const at = Math.round(atMs / 10) * 10;
  let changed = false;
  const segments = edits.segments.flatMap((segment) => {
    if (at <= segment.startMs + 100 || at >= segment.endMs - 100) return [segment];
    changed = true;
    return [
      { startMs: segment.startMs, endMs: at },
      { startMs: at, endMs: segment.endMs },
    ];
  });
  if (!changed) return null;
  return { ...edits, segments };
}

export function sourceMsAtOutput(edits: AudioEdits, outputMs: number): number {
  let remaining = Math.max(0, outputMs);
  for (const segment of edits.segments) {
    const length = segment.endMs - segment.startMs;
    if (remaining <= length) return segment.startMs + remaining;
    remaining -= length;
  }
  const last = edits.segments[edits.segments.length - 1];
  return last ? last.endMs : 0;
}

export function outputMsAtSource(edits: AudioEdits, sourceMs: number): number {
  let output = 0;
  for (const segment of edits.segments) {
    if (sourceMs < segment.startMs) return output;
    const length = segment.endMs - segment.startMs;
    if (sourceMs <= segment.endMs) return output + (sourceMs - segment.startMs);
    output += length;
  }
  return output;
}
