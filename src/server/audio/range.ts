export function byteRange(
  size: number,
  header: string | null,
): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";
  const start = Number(match[1]);
  const end = match[2] === "" ? size - 1 : Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start || end >= size) {
    return "invalid";
  }
  return { start, end };
}
