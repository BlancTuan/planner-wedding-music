import { describe, expect, it } from "vitest";
import { clippingWarning, validateRevision } from "@/server/media/revision-rules";

const source = 120000;

describe("revision rules", () => {
  it("accepts a one-second clip inside the source", () => {
    expect(
      validateRevision(
        { trimStartMs: 0, trimEndMs: 2000, fadeInMs: 100, fadeOutMs: 100, gainDb: 0 },
        source,
      ),
    ).toBeNull();
  });

  it("rejects an inverted range, a short clip, and fades longer than the clip", () => {
    expect(
      validateRevision(
        { trimStartMs: 4000, trimEndMs: 2000, fadeInMs: 0, fadeOutMs: 0, gainDb: 0 },
        source,
      ),
    ).toBe("INVALID_RANGE");
    expect(
      validateRevision(
        { trimStartMs: 0, trimEndMs: 500, fadeInMs: 0, fadeOutMs: 0, gainDb: 0 },
        source,
      ),
    ).toBe("CLIP_TOO_SHORT");
    expect(
      validateRevision(
        { trimStartMs: 0, trimEndMs: 2000, fadeInMs: 1500, fadeOutMs: 1500, gainDb: 0 },
        source,
      ),
    ).toBe("FADE_TOO_LONG");
  });

  it("rejects gain outside the allowed range and warns above unity", () => {
    expect(
      validateRevision(
        { trimStartMs: 0, trimEndMs: 2000, fadeInMs: 0, fadeOutMs: 0, gainDb: 7 },
        source,
      ),
    ).toBe("INVALID_GAIN");
  });

  it("warns about clipping from the real peak, not from the gain sign alone", () => {
    expect(clippingWarning(3, 0.9)).toBe(true);
    expect(clippingWarning(3, 0.5)).toBe(false);
    expect(clippingWarning(0, 1)).toBe(true);
    expect(clippingWarning(-6, 0.9)).toBe(false);
    expect(clippingWarning(0, 0.5)).toBe(false);
  });
});
