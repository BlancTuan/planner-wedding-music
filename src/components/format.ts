export function clock(ms: number | null | undefined, precise = false): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const negative = ms < 0;
  const units = precise ? Math.round(Math.abs(ms) / 100) : Math.floor(Math.abs(ms) / 1000);
  const perMinute = precise ? 600 : 60;
  const minutes = Math.floor(units / perMinute);
  const rest = units - minutes * perMinute;
  const seconds = precise ? (rest / 10).toFixed(1).padStart(4, "0") : String(rest).padStart(2, "0");
  return `${negative ? "-" : ""}${minutes}:${seconds}`;
}

export function megabytes(bytes: string | number | null | undefined): string {
  const value = Number(bytes);
  if (!Number.isFinite(value)) return "—";
  if (value <= 0) return "0 KB";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.ceil(value / 1024))} KB`;
}

export function percent(part: string | number, whole: string | number): number {
  const a = Number(part);
  const b = Number(whole);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return 0;
  return Math.min(100, Math.max(0, (a / b) * 100));
}
