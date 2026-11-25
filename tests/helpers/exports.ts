import { drainUserExports, getExport, queueExport } from "@/server/media/assets";

export async function exportNow(userId: string, revisionId: string, idempotencyKey: string) {
  const queued = await queueExport(userId, revisionId, idempotencyKey);
  await drainUserExports(userId);
  return getExport(userId, String(queued.id));
}
