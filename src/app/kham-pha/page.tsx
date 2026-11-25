import Link from "next/link";
import { cookies } from "next/headers";
import { AddToLibraryButton } from "@/components/add-to-library-button";
import { clock } from "@/components/format";
import { InfoIcon, SearchIcon } from "@/components/icons";
import { TrackPreview } from "@/components/track-preview";
import { userFromToken } from "@/server/auth";
import { listCategories, searchCatalog } from "@/server/catalog";
import { catalogCopiesForTracks } from "@/server/media/assets";

const vocalLabels: Record<string, string> = {
  VOCAL: "Có lời",
  INSTRUMENTAL: "Không lời",
  MIXED: "Kết hợp",
};

function discoverHref(params: Record<string, string | undefined>, stage: string) {
  const next = new URLSearchParams();
  if (params.q) next.set("q", params.q);
  if (params.vocalType) next.set("vocalType", params.vocalType);
  if (stage) next.set("stage", stage);
  const query = next.toString();
  return query ? `/kham-pha?${query}` : "/kham-pha";
}

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const [result, categories] = await Promise.all([
    searchCatalog({
      q: params.q ?? "",
      stage: params.stage ?? "",
      mood: params.mood ?? "",
      style: params.style ?? "",
      language: params.language ?? "",
      vocalType: params.vocalType ?? "",
      sortBy: params.sortBy ?? "title",
    }),
    listCategories(),
  ]);
  const ceremonies = categories.filter((item) => item.kind === "CEREMONY");
  const activeStage = ceremonies.find((item) => item.slug === params.stage);
  const filtered = Boolean(params.q || params.stage || params.vocalType);
  const jar = await cookies();
  const user = await userFromToken(jar.get("wmp_session")?.value ?? null);
  const saved = user ? await catalogCopiesForTracks(user.id, result.items.map((track) => track.id)) : new Map<string, string>();
  return (
    <div>
      <section className="band border-t-0">
        <div className="wrap pb-8 pt-12 max-md:pt-8">
          <p className="eyebrow">Mục lục nhạc lễ</p>
          <h1 className="page-title mt-2">Khám phá nhạc lễ</h1>
          <p className="page-lead">Nhạc được sắp theo từng phần của lễ cưới. Chọn một phần lễ, hoặc tìm theo tên bài và nghệ sĩ, gõ không dấu cũng được.</p>

          <nav aria-label="Lọc theo phần lễ" className="-mx-[var(--gut)] mt-8 overflow-x-auto px-[var(--gut)] pb-2">
            <ul className="flex gap-2 lg:flex-wrap">
              <li>
                <Link href={discoverHref(params, "")} aria-current={!params.stage ? "true" : undefined} className="filter-chip">
                  Mọi phần lễ
                </Link>
              </li>
              {ceremonies.map((item) => (
                <li key={item.id}>
                  <Link
                    href={discoverHref(params, item.slug)}
                    aria-current={params.stage === item.slug ? "true" : undefined}
                    className="filter-chip"
                  >
                    {item.nameVi}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <form className="mt-6 grid gap-3 md:grid-cols-[1fr_220px_auto]" action="/kham-pha" role="search">
            {params.stage ? <input type="hidden" name="stage" value={params.stage} /> : null}
            <div className="field">
              <label htmlFor="discover-q" className="label">Từ khoá</label>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                <input id="discover-q" name="q" defaultValue={params.q ?? ""} placeholder="Tên bài, nghệ sĩ…" className="input pl-12" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="discover-vocal" className="label">Giọng</label>
              <select id="discover-vocal" name="vocalType" defaultValue={params.vocalType ?? ""} className="select">
                <option value="">Tất cả</option>
                <option value="VOCAL">Có lời</option>
                <option value="INSTRUMENTAL">Không lời</option>
                <option value="MIXED">Kết hợp</option>
              </select>
            </div>
            <div className="flex items-end gap-4">
              <button className="btn btn-primary max-md:flex-1" type="submit">Tìm bài</button>
              {filtered ? <Link href="/kham-pha" className="link flex min-h-[44px] items-center whitespace-nowrap">Xoá bộ lọc</Link> : null}
            </div>
          </form>
        </div>
      </section>

      <section aria-labelledby="results-title" className="wrap py-12 max-md:py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-4">
          <h2 id="results-title" className="font-serif text-h3">
            {activeStage ? `Nhạc cho ${activeStage.nameVi.toLowerCase()}` : "Tất cả bài"}
          </h2>
          <p className="tnum text-sm text-muted" role="status">{result.total} bài</p>
        </div>
        {result.items.length === 0 ? (
          <div className="empty">
            <p className="empty-title">Không có bài khớp bộ lọc này.</p>
            <p className="max-w-measure text-base text-muted">Thử bỏ bớt một bộ lọc, hoặc tải file của chính bạn để cắt và dùng trong kế hoạch.</p>
            <div className="flex flex-wrap gap-3">
              {filtered ? <Link href="/kham-pha" className="btn btn-secondary">Xem tất cả bài</Link> : null}
              <Link href="/tai-len" className="btn btn-secondary">Tải nhạc của bạn</Link>
            </div>
          </div>
        ) : (
          <ol className="rows">
            {result.items.map((track, index) => (
              <li key={track.id}>
                <div className="row-link group grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-2 py-4 md:grid-cols-[2.5rem_minmax(0,1fr)_8rem_5rem_auto]">
                  <span className="tnum font-serif text-lead text-muted">{String(index + 1).padStart(2, "0")}</span>
                  <Link href={`/bai-hat/${track.id}`} className="min-w-0 no-underline">
                    <span className="block break-words font-serif text-h3 decoration-wine decoration-1 underline-offset-4 group-hover:underline">{track.title}</span>
                    <span className="block break-words text-sm text-muted">{track.artist}</span>
                  </Link>
                  <span className="hidden text-sm text-muted md:block">{vocalLabels[track.vocalType] ?? track.vocalType}</span>
                  <span className="tnum hidden text-sm text-muted md:block">{clock(track.durationMs)}</span>
                  <div className="col-start-2 flex flex-wrap items-center gap-2 md:col-start-auto md:justify-end">
                    {track.previewable ? (
                      <>
                        <TrackPreview trackId={track.id} title={track.title} />
                        <AddToLibraryButton trackId={track.id} title={track.title} savedAssetId={saved.get(track.id) ?? null} />
                      </>
                    ) : (
                      <span className="chip"><InfoIcon />Chỉ thông tin</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
