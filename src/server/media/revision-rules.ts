export const REVISION_NAME_MAX = 120;

export type RevisionInput = {
  trimStartMs: number;
  trimEndMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  gainDb: number;
};

export function validateRevision(input: RevisionInput, sourceDurationMs: number): string | null {
  const times = [input.trimStartMs, input.trimEndMs, input.fadeInMs, input.fadeOutMs];
  if (times.some((value) => !Number.isInteger(value))) return "INVALID_TIME";
  if (input.trimStartMs % 10 !== 0 || input.trimEndMs % 10 !== 0) return "INVALID_PRECISION";
  if (
    input.trimStartMs < 0 ||
    input.trimEndMs > sourceDurationMs ||
    input.trimStartMs >= input.trimEndMs
  ) {
    return "INVALID_RANGE";
  }
  const clip = input.trimEndMs - input.trimStartMs;
  if (clip < 1000) return "CLIP_TOO_SHORT";
  if (input.fadeInMs < 0 || input.fadeOutMs < 0 || input.fadeInMs > 10000 || input.fadeOutMs > 10000) {
    return "INVALID_FADE";
  }
  if (input.fadeInMs + input.fadeOutMs > clip) return "FADE_TOO_LONG";
  if (!Number.isFinite(input.gainDb) || input.gainDb < -24 || input.gainDb > 6) return "INVALID_GAIN";
  return null;
}

export function clippingWarning(gainDb: number, peak: number): boolean {
  return peak * 10 ** (gainDb / 20) >= 0.999;
}
