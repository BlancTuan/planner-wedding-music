import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { WaveformEditor } from "@/components/waveform-editor";
import { userFromToken } from "@/server/auth";
import { AppError } from "@/server/errors";
import { getOwnedAsset, getRevision, latestExport } from "@/server/media/assets";

const sourceLabels: Record<string, string> = { CATALOG: "Từ mục lục", UPLOAD: "File tải lên", YOUTUBE: "Từ YouTube" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function orNotFound<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}

export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ assetId: string }>;
  searchParams: Promise<{ revisionId?: string }>;
}) {
  const [{ assetId }, { revisionId }] = await Promise.all([params, searchParams]);
  const jar = await cookies();
  const user = await userFromToken(jar.get("wmp_session")?.value ?? null);
  const self = `/bien-tap/${assetId}${revisionId ? `?revisionId=${revisionId}` : ""}`;
  if (!user) redirect(`/dang-nhap?next=${encodeURIComponent(self)}`);
  if (!UUID.test(assetId) || (revisionId && !UUID.test(revisionId))) notFound();
  const asset = await orNotFound(() => getOwnedAsset(user.id, assetId));
  if (asset.status !== "READY" || asset.durationMs === null) notFound();
  const revision = revisionId ? await orNotFound(() => getRevision(user.id, revisionId)) : null;
  if (revision && revision.assetId !== asset.id) notFound();
  const lastExport = revision ? await latestExport(user.id, revision.id) : null;
  const facts = [
    sourceLabels[asset.sourceType] ?? asset.sourceType,
    asset.mediaFormat ? asset.mediaFormat.toUpperCase() : null,
    "Nguồn gốc giữ nguyên, mỗi lần lưu tạo một bản chỉnh mới",
  ].filter((fact): fact is string => Boolean(fact));
  return (
    <div className="studio min-h-[calc(100vh-var(--nav-h))]">
      <div className="wrap pb-16 pt-6 max-md:pb-12">
      <WaveformEditor
        key={revision?.id ?? "new"}
        title={asset.originalFilename || "Bản nhạc không tên"}
        facts={facts}
        assetId={asset.id}
        durationMs={asset.durationMs}
        initialRevision={
          revision
            ? {
                id: revision.id,
                name: revision.name,
                trimStartMs: revision.trimStartMs,
                trimEndMs: revision.trimEndMs,
                fadeInMs: revision.fadeInMs,
                fadeOutMs: revision.fadeOutMs,
                gainDb: Number(revision.gainDb),
              }
            : null
        }
        initialExport={lastExport}
      />
      </div>
    </div>
  );
}
