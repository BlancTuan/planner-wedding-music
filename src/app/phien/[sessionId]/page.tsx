import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SessionWorkspace } from "@/components/session-workspace";
import { userFromToken } from "@/server/auth";
import { readAudioSession } from "@/server/audio/sessions";
import { AppError } from "@/server/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ upload?: string }>;
}) {
  const [{ sessionId }, query] = await Promise.all([params, searchParams]);
  const jar = await cookies();
  const user = await userFromToken(jar.get("wmp_session")?.value ?? null);
  if (!user) redirect(`/dang-nhap?next=${encodeURIComponent(`/phien/${sessionId}`)}`);
  if (!UUID.test(sessionId)) notFound();
  try {
    const session = await readAudioSession(user.id, sessionId);
    return (
      <div className="studio min-h-[calc(100vh-var(--nav-h))]">
        <div className="wrap pb-16 pt-6 max-md:pb-12">
          <SessionWorkspace initial={session} focusUpload={query.upload === "1"} />
        </div>
      </div>
    );
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    if (error instanceof AppError && error.status === 410) {
      return (
        <div className="studio min-h-[calc(100vh-var(--nav-h))]">
          <div className="wrap flex min-h-[60vh] flex-col items-start justify-center gap-4">
            <h1 className="font-serif text-h2">Phiên sửa đã hết hạn</h1>
            <p className="max-w-xl text-studio-muted">File tạm đã được xoá trên máy chủ.</p>
          </div>
        </div>
      );
    }
    throw error;
  }
}
