import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";
import { lookupYouTubeMetadata } from "@/server/youtube/metadata";

describe("YouTube metadata lookup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a metadata failure when YouTube does not answer", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("timeout")));
    await expect(lookupYouTubeMetadata("https://www.youtube.com/watch?v=jNQXAC9IVRw")).rejects.toBeInstanceOf(AppError);
    await expect(lookupYouTubeMetadata("https://www.youtube.com/watch?v=jNQXAC9IVRw")).rejects.toMatchObject({
      code: "METADATA_FAILED",
      status: 502,
    });
  });
});
