import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as planAction } from "@/app/api/plans/[planId]/route";
import { deleteAccount, openSession, type SessionUser } from "@/server/auth";
import { createUpload, saveRevision } from "@/server/media/assets";
import {
  addCue,
  addStage,
  confirmReadiness,
  createPlan,
  duplicateStage,
  getPlan,
  removeCue,
  removeStage,
  reorderCues,
  reorderStages,
  snapshotStageFromPlaylist,
  updateCue,
  updateStage,
} from "@/server/plans";
import { addPlaylistItem, createPlaylist } from "@/server/playlists";
import { exportNow } from "../helpers/exports";

let user: SessionUser;
let token: string;
let revisionId: string;

async function planWithStages(names: string[]) {
  let plan = await createPlan(user.id, { name: `Kế hoạch ${randomUUID().slice(0, 6)}`, template: "EMPTY" });
  for (const name of names) plan = await addStage(user.id, plan.id, name, plan.version);
  return plan;
}

async function withCues(planId: string, stageId: string, instructions: string[]) {
  let plan = await getPlan(user.id, planId);
  for (const instruction of instructions) {
    plan = await addCue(user.id, planId, stageId, { revisionId, instruction, version: plan.version });
  }
  return plan;
}

function action(planId: string, body: unknown) {
  return planAction(
    new Request(`http://127.0.0.1/api/plans/${planId}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `wmp_session=${encodeURIComponent(token)}` },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ planId }) },
  );
}

beforeAll(async () => {
  const session = await openSession({ subject: `stage-ops-${randomUUID()}`, displayName: "Phần lễ" });
  user = session.user;
  token = session.token;
  const dir = mkdtempSync(path.join(tmpdir(), "wmp-ops-"));
  const wav = path.join(dir, "tone.wav");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-ac", "1", wav]);
  const upload = await createUpload({ userId: user.id, filename: "tone.wav", bytes: readFileSync(wav), idempotencyKey: `u-${randomUUID()}` });
  const revision = await saveRevision({
    userId: user.id,
    assetId: String(upload.assetId),
    idempotencyKey: `r-${randomUUID()}`,
    trimStartMs: 0,
    trimEndMs: 1500,
    fadeInMs: 0,
    fadeOutMs: 0,
    gainDb: 0,
  });
  revisionId = String(revision.id);
  await exportNow(user.id, revisionId, `e-${randomUUID()}`);
});

afterAll(async () => {
  await deleteAccount(user, true, user.version);
});

describe("stage operations", () => {
  it("reorders stages", async () => {
    const plan = await planWithStages(["A", "B", "C"]);
    const [a, b, c] = plan.stages.map((stage) => stage.id);

    const reordered = await reorderStages(user.id, plan.id, [c, a, b], plan.version);

    expect(reordered.stages.map((stage) => stage.name)).toEqual(["C", "A", "B"]);
    expect(reordered.version).toBe(plan.version + 1);
  });

  it("rejects a stage order with duplicate or missing ids and keeps the order", async () => {
    const plan = await planWithStages(["A", "B"]);
    const [a] = plan.stages.map((stage) => stage.id);

    await expect(reorderStages(user.id, plan.id, [a, a], plan.version)).rejects.toMatchObject({ status: 422 });
    await expect(reorderStages(user.id, plan.id, [a], plan.version)).rejects.toMatchObject({ status: 422 });
    expect((await getPlan(user.id, plan.id)).stages.map((stage) => stage.name)).toEqual(["A", "B"]);
  });

  it("rejects a stale version and changes nothing", async () => {
    const plan = await planWithStages(["A", "B"]);
    const [a, b] = plan.stages.map((stage) => stage.id);

    await expect(reorderStages(user.id, plan.id, [b, a], plan.version - 1)).rejects.toMatchObject({ status: 409 });
    expect((await getPlan(user.id, plan.id)).stages.map((stage) => stage.name)).toEqual(["A", "B"]);
  });

  it("duplicates a stage with its cues right after the original, without approval", async () => {
    const plan = await planWithStages(["A", "B"]);
    const [a] = plan.stages.map((stage) => stage.id);
    const cued = await withCues(plan.id, a, ["một", "hai"]);
    const approved = await updateCue(user.id, plan.id, cued.stages[0].cues[0].id, { listeningApproved: true, version: cued.version });

    const copied = await duplicateStage(user.id, plan.id, a, approved.version);

    expect(copied.stages.map((stage) => stage.name)).toEqual(["A", "A (bản sao)", "B"]);
    expect(copied.stages[1].cues.map((cue) => cue.instruction)).toEqual(["một", "hai"]);
    expect(copied.stages[1].cues.every((cue) => cue.revisionId === revisionId && cue.listeningApprovedAt === null)).toBe(true);
  });

  it("removes a stage with its cues and invalidates a ready plan", async () => {
    const plan = await planWithStages(["A", "B", "C"]);
    const [, b] = plan.stages.map((stage) => stage.id);
    let current = plan;
    for (const stage of plan.stages) {
      current = await withCues(plan.id, stage.id, ["phát"]);
      const cue = current.stages.find((item) => item.id === stage.id)!.cues[0];
      current = await updateCue(user.id, plan.id, cue.id, { listeningApproved: true, version: current.version });
    }
    const ready = await confirmReadiness(user.id, plan.id, current.version);

    const removed = await removeStage(user.id, plan.id, b, ready.version);

    expect(removed.stages.map((stage) => stage.name)).toEqual(["A", "C"]);
    expect(removed.stages.map((stage) => stage.position)).toEqual([0, 1]);
    expect(removed.state).toBe("NEEDS_REVIEW");
  });

  it("stores approximate time, duration and clears the description", async () => {
    const plan = await planWithStages(["A"]);
    const stageId = plan.stages[0].id;
    const described = await updateStage(user.id, plan.id, stageId, { description: "Mô tả", version: plan.version });

    const updated = await updateStage(user.id, plan.id, stageId, {
      description: null,
      approximateTime: "15:30",
      estimatedDurationMs: 120000,
      version: described.version,
    });

    expect(updated.stages[0]).toMatchObject({ description: null, approximateTime: "15:30", estimatedDurationMs: 120000 });
  });
});

describe("cue operations", () => {
  it("reorders cues within a stage", async () => {
    const plan = await planWithStages(["A"]);
    const stageId = plan.stages[0].id;
    const cued = await withCues(plan.id, stageId, ["một", "hai", "ba"]);
    const [one, two, three] = cued.stages[0].cues.map((cue) => cue.id);

    const reordered = await reorderCues(user.id, plan.id, stageId, [three, one, two], cued.version);

    expect(reordered.stages[0].cues.map((cue) => cue.instruction)).toEqual(["ba", "một", "hai"]);
    await expect(reorderCues(user.id, plan.id, stageId, [one, one, two], reordered.version)).rejects.toMatchObject({ status: 422 });
  });

  it("removes a cue and closes the gap", async () => {
    const plan = await planWithStages(["A"]);
    const stageId = plan.stages[0].id;
    const cued = await withCues(plan.id, stageId, ["một", "hai", "ba"]);

    const removed = await removeCue(user.id, plan.id, cued.stages[0].cues[0].id, cued.version);

    expect(removed.stages[0].cues.map((cue) => cue.instruction)).toEqual(["hai", "ba"]);
    expect(removed.stages[0].cues.map((cue) => cue.position)).toEqual([0, 1]);
  });

  it("refreshes only the cues that came from the given playlist", async () => {
    const plan = await planWithStages(["A"]);
    const stageId = plan.stages[0].id;
    const first = await createPlaylist(user.id, `P1 ${randomUUID().slice(0, 4)}`, null);
    await addPlaylistItem(user.id, String(first.id), revisionId, "từ P1", Number(first.version));
    const second = await createPlaylist(user.id, `P2 ${randomUUID().slice(0, 4)}`, null);
    await addPlaylistItem(user.id, String(second.id), revisionId, "từ P2", Number(second.version));
    const one = await snapshotStageFromPlaylist(user.id, plan.id, stageId, String(first.id), plan.version, false);
    const both = await snapshotStageFromPlaylist(user.id, plan.id, stageId, String(second.id), one.version, false);

    const refreshed = await snapshotStageFromPlaylist(user.id, plan.id, stageId, String(first.id), both.version, true);

    expect(refreshed.stages[0].cues.map((cue) => cue.instruction).sort()).toEqual(["từ P1", "từ P2"]);
  });
});

describe("plan action validation", () => {
  it("rejects a bad stage status with 422 instead of a database error", async () => {
    const plan = await planWithStages(["A"]);
    const response = await action(plan.id, { action: "update-stage", stageId: plan.stages[0].id, status: "BOGUS", version: plan.version });
    expect(response.status).toBe(422);
  });

  it("rejects a non-uuid stage id with 422", async () => {
    const plan = await planWithStages(["A"]);
    const response = await action(plan.id, { action: "add-cue", stageId: "x", revisionId, version: plan.version });
    expect(response.status).toBe(422);
  });

  it("keeps a null responsible person as null", async () => {
    const plan = await planWithStages(["A"]);
    const cued = await withCues(plan.id, plan.stages[0].id, ["một"]);
    const response = await action(plan.id, {
      action: "update-cue",
      cueId: cued.stages[0].cues[0].id,
      responsiblePerson: null,
      version: cued.version,
    });
    expect(response.status).toBe(200);
    expect((await response.json()).stages[0].cues[0].responsiblePerson).toBeNull();
  });
});
