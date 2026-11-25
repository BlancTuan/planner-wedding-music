import Link from "next/link";
import { AlertIcon, CheckIcon, ClockIcon, DownloadIcon, InfoIcon } from "@/components/icons";
import { safeThumbnail, type ImportOutcome } from "@/components/youtube-import-status";
import { parseYouTubeUrl } from "@/server/youtube/url";

const outcomeIcons = {
  info: <ClockIcon />,
  ok: <CheckIcon />,
  warn: <InfoIcon />,
  error: <AlertIcon />,
};

function sourceHref(url: string): string | null {
  if ("error" in parseYouTubeUrl(url)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function YouTubeImportCard({
  title,
  channelName,
  thumbnailUrl,
  durationLabel,
  sourceUrl,
  outcome,
  importing,
  downloading,
  onDownload,
  onChooseFile,
}: {
  title: string | null;
  channelName: string | null;
  thumbnailUrl: string | null;
  durationLabel: string;
  sourceUrl: string;
  outcome: ImportOutcome;
  importing: boolean;
  downloading: boolean;
  onDownload: () => void;
  onChooseFile: () => void;
}) {
  const thumb = safeThumbnail(thumbnailUrl);
  const href = sourceHref(sourceUrl);
  return (
    <article className="flex flex-col gap-4 rounded-md border border-line bg-paper p-4" aria-label="Thông tin video">
      <div className="flex gap-4 max-sm:flex-col">
        {thumb ? (
          <img src={thumb} alt="" className="h-24 w-40 shrink-0 rounded-sm object-cover max-sm:h-auto max-sm:w-full" />
        ) : (
          <div className="h-24 w-40 shrink-0 rounded-sm bg-champagne max-sm:w-full" />
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="break-words font-serif text-h3">{title || "Video không có tiêu đề"}</h3>
          <p className="text-muted">{channelName || "Không rõ kênh"}</p>
          <p className="tnum text-sm">Thời lượng {durationLabel}</p>
        </div>
      </div>
      <p className="break-all text-sm">
        <span className="text-muted">Nguồn </span>
        {href ? (
          <a href={href} className="link" target="_blank" rel="noreferrer">
            {sourceUrl}
          </a>
        ) : (
          <span>{sourceUrl}</span>
        )}
      </p>
      <p className={`notice notice-${outcome.tone}`}>
        {outcomeIcons[outcome.tone]}
        <span>{outcome.text}</span>
      </p>
      <div className="flex flex-wrap gap-3">
        {outcome.editorHref ? (
          <Link href={outcome.editorHref} className="btn btn-primary">
            Mở trình sửa
          </Link>
        ) : (
          <>
            {outcome.canDownload || downloading ? (
              <button type="button" className="btn btn-primary" onClick={onDownload} disabled={downloading || importing} aria-busy={downloading}>
                <DownloadIcon />
                {downloading ? "Đang tải audio…" : outcome.tone === "error" ? "Tải lại audio" : "Tải audio và sửa"}
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary" onClick={onChooseFile} disabled={downloading || importing} aria-busy={importing}>
              {importing ? "Đang mở phiên…" : "Dùng file của tôi"}
            </button>
          </>
        )}
      </div>
    </article>
  );
}
