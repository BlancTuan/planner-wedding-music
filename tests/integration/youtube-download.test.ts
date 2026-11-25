import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { deleteAccount, openSession, type SessionUser } from "@/server/auth";
import { one } from "@/server/db";
import { AppError } from "@/server/errors";
import { safePath } from "@/server/storage";
import { createImport } from "@/server/youtube/imports";

const toneFixture = path.join(process.cwd(), "tests/fixtures/media/tone.wav");
const videoUrl = "https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL123";

function stubOembed() {
  vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
    if (String(input).includes("oembed")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            title: "Me at the zoo",
            author_name: "jawed",
            thumbnail_url: "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }
    return Promise.resolve(new Response("", { status: 404 }));
  });
}

describe("YouTube audio download import", () => {
  let user: SessionUser;

  beforeAll(async () => {
    const session = await openSession({ subject: `yt-download-${randomUUID()}`, displayName: "Tải YouTube" });
    user = session.user;
  }, 30000);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await deleteAccount(user, true, user.version);
  });

  it("downloads the audio into a ready library asset with a waveform", async () => {
    stubOembed();
    const seen: string[] = [];
    const job = await createImport(user.id, videoUrl, `k-${randomUUID()}`, async (videoId, outputDir) => {
      seen.push(videoId);
      const file = path.join(outputDir, "audio.wav");
      await copyFile(toneFixture, file);
      return file;
    });
    expect(seen).toEqual(["jNQXAC9IVRw"]);
    expect(job.state).toBe("READY_FOR_EDITING");
    expect(job.acquisitionState).toBe("AVAILABLE");
    expect(job.title).toBe("Me at the zoo");
    expect(job.assetId).toBeTruthy();
    const asset = await one<{ sourceType: string; videoId: string; status: string; owner: string }>(
      `SELECT source_type AS "sourceType", youtube_video_id AS "videoId", status, owner_user_id::text AS owner
       FROM audio_assets WHERE id = $1`,
      [job.assetId],
    );
    expect(asset).toEqual({ sourceType: "YOUTUBE", videoId: "jNQXAC9IVRw", status: "READY", owner: user.id });
    const wave = await one<{ buckets: number }>(`SELECT bucket_count AS buckets FROM waveforms WHERE asset_id = $1`, [
      job.assetId,
    ]);
    expect(wave!.buckets).toBeGreaterThan(0);
    expect(existsSync(safePath(`temporary/youtube-${job.id}`))).toBe(false);
  });

  it("records a failed download with its reason and leaves no asset or temporary files", async () => {
    stubOembed();
    const job = await createImport(user.id, videoUrl, `k-${randomUUID()}`, async () => {
      throw new AppError(422, "DOWNLOAD_FAILED", "Không tải được audio từ YouTube.");
    });
    expect(job.state).toBe("FAILED");
    expect(job.errorCode).toBe("DOWNLOAD_FAILED");
    expect(job.assetId).toBeNull();
    expect(job.title).toBe("Me at the zoo");
    expect(existsSync(safePath(`temporary/youtube-${job.id}`))).toBe(false);
  });
});
