import { randomUUID } from "node:crypto";

export function snapshotPlaylist(
  items: Array<{ id: string; revisionId: string; note: string; position: number }>,
) {
  return items.map((item) => ({
    revisionId: item.revisionId,
    note: item.note,
    position: item.position,
    playlistItemId: item.id,
  }));
}

export function duplicatePlan(plan: {
  name: string;
  stages: Array<{ id: string; name: string; cues: Array<{ id: string; revisionId: string }> }>;
}) {
  return {
    name: plan.name,
    stages: plan.stages.map((stage) => ({
      id: randomUUID(),
      name: stage.name,
      cues: stage.cues.map((cue) => ({
        id: randomUUID(),
        revisionId: cue.revisionId,
      })),
    })),
  };
}
