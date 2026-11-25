import { describe, expect, it } from "vitest";
import { parseYouTubeUrl } from "@/server/youtube/url";

describe("parseYouTubeUrl video id length", () => {
  it.each([
    ["https://youtu.be/jNQXAC9IVRwEXTRA"],
    ["https://www.youtube.com/watch?v=jNQXAC9IVRwEXTRA"],
    ["https://www.youtube.com/shorts/jNQXAC9IVRwEXTRA"],
    ["https://youtu.be/jNQXAC9IVR"],
    ["https://www.youtube.com/watch?v=jNQXAC9IVR%21"],
  ])("rejects %s", (raw) => {
    expect(parseYouTubeUrl(raw)).toEqual({ error: "MALFORMED_URL" });
  });

  it.each([
    ["https://youtu.be/jNQXAC9IVRw"],
    ["https://youtu.be/jNQXAC9IVRw?t=10"],
    ["https://www.youtube.com/watch?v=jNQXAC9IVRw"],
    ["https://m.youtube.com/watch?v=jNQXAC9IVRw&list=PL1"],
    ["https://www.youtube.com/shorts/jNQXAC9IVRw"],
    ["https://music.youtube.com/watch?v=jNQXAC9IVRw"],
    ["https://www.youtube.com/shorts/jNQXAC9IVRw?feature=share"],
  ])("accepts %s", (raw) => {
    expect(parseYouTubeUrl(raw)).toEqual({ videoId: "jNQXAC9IVRw" });
  });
});
