import { snapshotStageFromPlaylist } from "@/server/plans";
import { planRoute } from "@/server/plans/route";
import { playlistSnapshotBody } from "@/server/plans/schemas";

export const POST = planRoute(playlistSnapshotBody, (userId, { planId, stageId }: { planId: string; stageId: string }, body) =>
  snapshotStageFromPlaylist(userId, planId, stageId, body.playlistId, body.version, false),
);
