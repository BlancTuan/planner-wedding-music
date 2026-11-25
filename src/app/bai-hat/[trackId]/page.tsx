import Link from "next/link";
import { notFound } from "next/navigation";
import { AudioPlayer } from "@/components/audio-player";
import { clock } from "@/components/format";
import { ArrowLeftIcon, InfoIcon } from "@/components/icons";
import { getPublishedTrack } from "@/server/catalog";
import { AppError } from "@/server/errors";

const vocalLabels: Record<string, string> = {
  VOCAL: "Có lời",
  INSTRUMENTAL: "Không lời",
  MIXED: "Kết hợp",
};

const permissionLabels: Record<string, string> = {
  PREVIEW_ALLOWED: "Được nghe thử",
  METADATA_ONLY: "Chỉ thông tin",
  RESTRICTED: "Hạn chế",
};

export default async function TrackPage({ params }: { params: Promise<{ trackId: string }> }) {
  const { trackId } = await params;
  try {
    const track = await getPublishedTrack(trackId);
    return (
      <article className="wrap page">
        <Link href="/kham-pha" className="back-link">
          <ArrowLeftIcon className="h-4 w-4" />
          Về khám phá
        </Link>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="text-lead text-muted">{track.artist}</p>
            <h1 className="mt-2 font-serif text-display font-normal">{track.title}</h1>
            {track.stages.length > 0 ? (
              <ul className="mt-6 flex flex-wrap gap-2" aria-label="Phần lễ phù hợp">
                {track.stages.map((stage) => (
                  <li key={stage.slug}>
                    <Link href={`/kham-pha?stage=${encodeURIComponent(stage.slug)}`} className="filter-chip">{stage.nameVi}</Link>
                  </li>
                ))}
              </ul>
            ) : null}
            <dl className="mt-12 grid gap-x-8 sm:grid-cols-2">
              <div className="border-t border-line py-4">
                <dt className="label">Hình thức</dt>
                <dd className="mt-1 text-base">{vocalLabels[track.vocalType] ?? track.vocalType}</dd>
              </div>
              <div className="border-t border-line py-4">
                <dt className="label">Thời lượng</dt>
                <dd className="tnum mt-1 text-base">{clock(track.durationMs)}</dd>
              </div>
              <div className="border-t border-line py-4">
                <dt className="label">Quyền dùng</dt>
                <dd className="mt-1 text-base">{permissionLabels[track.usagePermission] ?? track.usagePermission}</dd>
              </div>
              <div className="border-t border-line py-4 sm:col-span-2">
                <dt className="label">Nguồn</dt>
                <dd className="mt-1 max-w-measure text-base">{track.sourceNote}</dd>
              </div>
            </dl>
          </div>
          <aside className="lg:col-span-5 lg:pt-10" aria-label="Nghe thử">
            {track.previewable ? (
              <div className="flex flex-col gap-3">
                <h2 className="font-serif text-h3">Nghe thử</h2>
                <AudioPlayer name={track.title} src={`/api/catalog/tracks/${track.id}/preview`} label="Âm lượng ở đây không đổi bản chỉnh đã lưu." />
                <p className="text-sm text-muted">Chỉ một bản nghe thử phát tại một thời điểm. Nhạc không tự phát.</p>
              </div>
            ) : (
              <div className="panel flex flex-col gap-3">
                <p className="flex items-center gap-2 font-serif text-h3"><InfoIcon className="h-5 w-5 text-muted" />Chỉ có thông tin</p>
                <p className="text-base">Bài này chỉ có thông tin, chưa phải nguồn để sửa.</p>
                <p className="text-base text-muted">Nếu bạn có file được phép dùng, hãy tải lên thư viện để cắt và đưa vào kế hoạch.</p>
                <Link href="/tai-len" className="btn btn-secondary self-start">Tải nhạc của bạn</Link>
              </div>
            )}
          </aside>
        </div>
      </article>
    );
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}
