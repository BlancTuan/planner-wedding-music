const PROBE_ORIGIN = "http://x.invalid";
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

export function safeNextPath(value: string | null | undefined, fallback = "/bang-dieu-khien"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  if (CONTROL_OR_BACKSLASH.test(value)) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (CONTROL_OR_BACKSLASH.test(decoded) || decoded.startsWith("//")) return fallback;
  try {
    if (new URL(value, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return fallback;
  } catch {
    return fallback;
  }
  return value;
}
