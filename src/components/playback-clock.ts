export function shownPlayhead(liveMs: number | null, cursorMs: number | null, fallbackMs: number): number {
  if (liveMs !== null && Number.isFinite(liveMs)) return liveMs;
  if (cursorMs !== null && Number.isFinite(cursorMs)) return cursorMs;
  return fallbackMs;
}
