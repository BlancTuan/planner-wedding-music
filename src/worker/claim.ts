import { one } from "@/server/db";
import { recoverAllStaleExports } from "@/server/media/assets";

export async function claimQueuedExport() {
  await recoverAllStaleExports();
  try {
    return await one<{ id: string }>(
      `WITH next_job AS (
         SELECT q.id FROM export_artifacts q
         WHERE q.state = 'QUEUED'
           AND NOT EXISTS (
             SELECT 1 FROM export_artifacts a
             WHERE a.owner_user_id = q.owner_user_id AND a.state IN ('PROCESSING', 'VERIFYING')
           )
         ORDER BY q.created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE export_artifacts e
       SET state = 'PROCESSING', progress = 10, updated_at = now()
       FROM next_job
       WHERE e.id = next_job.id
       RETURNING e.id`,
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return null;
    throw error;
  }
}
