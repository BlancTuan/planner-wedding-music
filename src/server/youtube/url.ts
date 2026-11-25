const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

export function parseYouTubeUrl(raw: string): { videoId: string } | { error: "MALFORMED_URL" } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: "MALFORMED_URL" };
  }
  const host = url.hostname.replace(/^www\./, "");
  let videoId = "";
  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
  } else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") videoId = url.searchParams.get("v") ?? "";
    else if (url.pathname.startsWith("/shorts/")) videoId = url.pathname.split("/")[2] ?? "";
    else return { error: "MALFORMED_URL" };
  } else {
    return { error: "MALFORMED_URL" };
  }
  if (!VIDEO_ID.test(videoId)) return { error: "MALFORMED_URL" };
  return { videoId };
}
