import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as archivePlan } from "@/app/api/plans/[planId]/archive/route";
import { PATCH as patchCue, DELETE as deleteCue } from "@/app/api/plans/[planId]/cues/[cueId]/route";
import { POST as duplicatePlan } from "@/app/api/plans/[planId]/duplicate/route";
import { POST as reopenPlan } from "@/app/api/plans/[planId]/reopen/route";
import { POST as duplicateStage } from "@/app/api/plans/[planId]/stages/[stageId]/duplicate/route";
import { POST as fromPlaylist } from "@/app/api/plans/[planId]/stages/[stageId]/cues/from-playlist/route";
import { PUT as orderCues } from "@/app/api/plans/[planId]/stages/[stageId]/cues/order/route";
import { POST as refreshPlaylist } from "@/app/api/plans/[planId]/stages/[stageId]/cues/refresh-playlist/route";
import { POST as addCueRoute } from "@/app/api/plans/[planId]/stages/[stageId]/cues/route";
import { PATCH as patchStage, DELETE as deleteStage } from "@/app/api/plans/[planId]/stages/[stageId]/route";
import { PUT as orderStages } from "@/app/api/plans/[planId]/stages/order/route";
import { POST as addStageRoute } from "@/app/api/plans/[planId]/stages/route";
import { deleteAccount, openSession, type SessionUser } from "@/server/auth";
import { createUpload, saveRevision } from "@/server/media/assets";
import { createPlan, getPlan } from "@/server/plans";
import { addPlaylistItem, createPlaylist } from "@/server/playlists";

type Params = Record<string, string>;
type Handler = (request: Request, context: { params: Promise<Params> }) => Promise<Response>;

let user: SessionUser;
let other: SessionUser;
let token: string;
let otherToken: string;
let revisionId: string;

async function call(handler: Handler, method: string, params: Params, body?: unknown, session = token) {
  const request = new Request("http://localhost/api", {
    method,
    headers: { cookie: `wmp_session=${session}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await handler(request, { params: Promise.resolve(params) });
  return { status: response.status, body: await response.json() };
}

async function freshPlan() {
  return createPlan(user.id, { name: `REST ${randomUUID().slice(0, 6)}`, template: "EMPTY" });
}

beforeAll(async () => {
  const first = await openSession({ subject: `rest-${randomUUID()}`, displayName: "REST" });
  const second = await openSession({ subject: `rest-other-${randomUUID()}`, displayName: "Khác" });
  user = first.user;
  token = first.token;
  other = second.user;
  otherToken = second.token;
  const dir = mkdtempSync(path.join(tmpdir(), "wmp-rest-"));
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
});

afterAll(async () => {
  await deleteAccount(user, true, user.version);
  await deleteAccount(other, true, other.version);
});

describe("plan routes from the HTTP contract", () => {
  it("duplicates, archives and reopens a plan", async () => {
    const plan = await freshPlan();

    const copy = await call(duplicatePlan, "POST", { planId: plan.id });
    expect(copy.status).toBe(201);
    expect(copy.body.id).not.toBe(plan.id);

    const archived = await call(archivePlan, "POST", { planId: plan.id }, { version: plan.version });
    expect(archived.status).toBe(200);
    expect(archived.body.state).toBe("ARCHIVED");

    const reopened = await call(reopenPlan, "POST", { planId: plan.id }, { version: archived.body.version });
    expect(reopened.body.state).toBe("DRAFT");
  });

  it("adds, edits, orders, duplicates and removes stages", async () => {
    const plan = await freshPlan();
    const one = await call(addStageRoute, "POST", { planId: plan.id }, { name: "Đón khách", version: plan.version });
    expect(one.status).toBe(201);
    const two = await call(addStageRoute, "POST", { planId: plan.id }, { name: "Cắt bánh", version: one.body.version });
    const [first, second] = two.body.stages;

    const edited = await call(
      patchStage,
      "PATCH",
      { planId: plan.id, stageId: first.id },
      { status: "NO_MUSIC", approximateTime: "17:30", version: two.body.version },
    );
    expect(edited.status).toBe(200);
    expect(edited.body.stages[0]).toMatchObject({ status: "NO_MUSIC", approximateTime: "17:30" });

    const ordered = await call(orderStages, "PUT", { planId: plan.id }, { stageIds: [second.id, first.id], version: edited.body.version });
    expect(ordered.body.stages.map((stage: { id: string }) => stage.id)).toEqual([second.id, first.id]);

    const copied = await call(duplicateStage, "POST", { planId: plan.id, stageId: second.id }, { version: ordered.body.version });
    expect(copied.status).toBe(201);
    expect(copied.body.stages).toHaveLength(3);

    const removed = await call(deleteStage, "DELETE", { planId: plan.id, stageId: first.id }, { version: copied.body.version });
    expect(removed.status).toBe(200);
    expect(removed.body.stages.map((stage: { id: string }) => stage.id)).not.toContain(first.id);
  });

  it("adds, edits, orders and removes cues", async () => {
    let plan = await freshPlan();
    const staged = await call(addStageRoute, "POST", { planId: plan.id }, { name: "Lối vào", version: plan.version });
    const stageId = staged.body.stages[0].id;
    const a = await call(addCueRoute, "POST", { planId: plan.id, stageId }, { revisionId, instruction: "A", version: staged.body.version });
    expect(a.status).toBe(201);
    const b = await call(addCueRoute, "POST", { planId: plan.id, stageId }, { revisionId, instruction: "B", version: a.body.version });
    const [cueA, cueB] = b.body.stages[0].cues;

    const edited = await call(
      patchCue,
      "PATCH",
      { planId: plan.id, cueId: cueA.id },
      { responsiblePerson: "Anh Minh", listeningApproved: true, version: b.body.version },
    );
    expect(edited.body.stages[0].cues[0]).toMatchObject({ responsiblePerson: "Anh Minh" });
    expect(edited.body.stages[0].cues[0].listeningApprovedAt).not.toBeNull();

    const ordered = await call(orderCues, "PUT", { planId: plan.id, stageId }, { cueIds: [cueB.id, cueA.id], version: edited.body.version });
    expect(ordered.body.stages[0].cues.map((cue: { id: string }) => cue.id)).toEqual([cueB.id, cueA.id]);

    const removed = await call(deleteCue, "DELETE", { planId: plan.id, cueId: cueB.id }, { version: ordered.body.version });
    expect(removed.body.stages[0].cues.map((cue: { id: string }) => cue.id)).toEqual([cueA.id]);
    plan = await getPlan(user.id, plan.id);
    expect(plan.version).toBe(removed.body.version);
  });

  it("copies cues from a playlist and refreshes them", async () => {
    const plan = await freshPlan();
    const staged = await call(addStageRoute, "POST", { planId: plan.id }, { name: "Tiệc", version: plan.version });
    const stageId = staged.body.stages[0].id;
    const playlist = (await createPlaylist(user.id, `Tiệc ${randomUUID().slice(0, 4)}`, null)) as { id: string; version: number };
    await addPlaylistItem(user.id, playlist.id, revisionId, null, playlist.version);

    const copied = await call(fromPlaylist, "POST", { planId: plan.id, stageId }, { playlistId: playlist.id, version: staged.body.version });
    expect(copied.status).toBe(200);
    expect(copied.body.stages[0].cues).toHaveLength(1);

    const refreshed = await call(refreshPlaylist, "POST", { planId: plan.id, stageId }, { playlistId: playlist.id, version: copied.body.version });
    expect(refreshed.body.stages[0].cues).toHaveLength(1);
  });

  it("rejects a stale version, invalid values and another user's plan", async () => {
    const plan = await freshPlan();
    const staged = await call(addStageRoute, "POST", { planId: plan.id }, { name: "Lễ", version: plan.version });
    const stageId = staged.body.stages[0].id;

    expect((await call(patchStage, "PATCH", { planId: plan.id, stageId }, { name: "X", version: plan.version })).status).toBe(409);
    expect((await call(patchStage, "PATCH", { planId: plan.id, stageId }, { status: "MAYBE", version: staged.body.version })).status).toBe(422);
    expect((await call(orderStages, "PUT", { planId: plan.id }, { stageIds: ["x"], version: staged.body.version })).status).toBe(422);
    expect((await call(deleteStage, "DELETE", { planId: plan.id, stageId }, { version: staged.body.version }, otherToken)).status).toBe(404);
    expect((await call(deleteStage, "DELETE", { planId: plan.id, stageId: "not-a-uuid" }, { version: staged.body.version })).status).toBe(404);
  });
});
