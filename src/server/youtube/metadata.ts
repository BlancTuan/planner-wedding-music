import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { inspectAcquisition, type AcquisitionInspection } from "@/server/youtube/acquisition";
import { parseYouTubeUrl } from "@/server/youtube/url";

export type VideoMetadata = {
  videoId: string;
  title: string | null;
  channelName: string | null;
  thumbnailUrl: string | null;
  durationMs: number | null;
  originalUrl: string;
  acquisitionState: AcquisitionInspection["acquisitionState"];
  reasonCode: string;
};

export async function lookupYouTubeMetadata(rawUrl: string): Promise<VideoMetadata> {
  const parsed = parseYouTubeUrl(rawUrl);
  if ("error" in parsed) throw new AppError(422, "MALFORMED_URL", "Liên kết YouTube không hợp lệ.");
  const canonical = `https://www.youtube.com/watch?v=${parsed.videoId}`;
  let title: string | null = null;
  let channelName: string | null = null;
  let thumbnailUrl: string | null = null;
  let durationMs: number | null = null;
  try {
    const oembed = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (oembed.ok) {
      const body = (await oembed.json()) as { title?: unknown; author_name?: unknown; thumbnail_url?: unknown };
      title = typeof body.title === "string" ? body.title : null;
      channelName = typeof body.author_name === "string" ? body.author_name : null;
      thumbnailUrl = typeof body.thumbnail_url === "string" ? body.thumbnail_url : null;
    } else if (oembed.status === 401 || oembed.status === 403 || oembed.status === 404) {
      throw new AppError(422, "VIDEO_UNAVAILABLE", "Video riêng tư, đã gỡ, hoặc không xem được.");
    } else {
      throw new AppError(502, "METADATA_FAILED", "Không lấy được thông tin video.");
    }
    const apiKey = getEnv().youtubeApiKey;
    if (apiKey) {
      const data = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${parsed.videoId}&key=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (data.ok) {
        const body = (await data.json()) as {
          items?: Array<{ snippet?: { title?: string; channelTitle?: string; thumbnails?: { high?: { url?: string } } }; contentDetails?: { duration?: string } }>;
        };
        const item = body.items?.[0];
        if (!item) throw new AppError(422, "VIDEO_UNAVAILABLE", "Không tìm thấy video này.");
        title = item.snippet?.title ?? title;
        channelName = item.snippet?.channelTitle ?? channelName;
        thumbnailUrl = item.snippet?.thumbnails?.high?.url ?? thumbnailUrl;
        durationMs = item.contentDetails?.duration ? isoDurationMs(item.contentDetails.duration) : null;
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, "METADATA_FAILED", "Không lấy được thông tin video.");
  }
  return {
    videoId: parsed.videoId,
    title,
    channelName,
    thumbnailUrl,
    durationMs,
    originalUrl: rawUrl,
    ...inspectAcquisition(parsed.videoId),
  };
}

function isoDurationMs(value: string): number {
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(value);
  if (!match) return 0;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}
