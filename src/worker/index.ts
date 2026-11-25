import { sweepExpiredSessions } from "@/server/audio/sessions";
import { query } from "@/server/db";
import { processExport, processUploadJob } from "@/server/media/assets";
import { claimQueuedExport } from "./claim";

async function tick() {
  await sweepExpiredSessions().catch((error: unknown) => console.error(error));
  const claimed = await claimQueuedExport();
  if (claimed) await processExport(claimed.id, true);
  const upload = await query<{ id: string }>(
    "SELECT id FROM upload_jobs WHERE state = 'PENDING' ORDER BY created_at LIMIT 1",
  );
  if (upload[0]) await processUploadJob(upload[0].id);
}

if (process.argv[1]?.endsWith("index.ts")) {
  setInterval(() => {
    void tick().catch((error) => console.error(error));
  }, 2000);
}

export { tick };
