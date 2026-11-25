import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteAccount, openSession, type SessionUser } from "@/server/auth";
import { createUpload, saveRevision } from "@/server/media/assets";
import { addCue, addStage, confirmReadiness, createPlan, getPlan, readinessForPlan, updateCue } from "@/server/plans";
import { exportNow } from "../helpers/exports";

let user: SessionUser;
let assetId: string;

async function newRevision(trimEndMs: number) {
  const revision = await saveRevision({
    userId: user.id,
    assetId,
    idempotencyKey: `r-${randomUUID()}`,
    trimStartMs: 0,
    trimEndMs,
    fadeInMs: 0,
    fadeOutMs: 0,
    gainDb: 0,
  });
  return String(revision.id);
}

async function planWithCue(revisionId: string) {
  const plan = await createPlan(user.id, { name: `Kế hoạch ${randomUUID().slice(0, 6)}`, template: "EMPTY" });
  const staged = await addStage(user.id, plan.id, "Lối vào cô dâu", plan.version);
  const cued = await addCue(user.id, plan.id, staged.stages[0].id, { revisionId, instruction: "Khi MC mời", version: staged.version });
  return { planId: plan.id, cueId: cued.stages[0].cues[0].id, version: cued.version };
}

beforeAll(async () => {
  const session = await openSession({ subject: `readiness-${randomUUID()}`, displayName: "Sẵn" });
  user = session.user;
  const dir = mkdtempSync(path.join(tmpdir(), "wmp-ready-"));
  const wav = path.join(dir, "tone.wav");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-ac", "1", wav]);
  const upload = await createUpload({ userId: user.id, filename: "tone.wav", bytes: readFileSync(wav), idempotencyKey: `u-${randomUUID()}` });
  assetId = String(upload.assetId);
});

afterAll(async () => {
  await deleteAccount(user, true, user.version);
});

describe("readiness checks", () => {
  it("reports a cue whose revision has no MP3 export", async () => {
    const { planId, cueId, version } = await planWithCue(await newRevision(1200));
    await updateCue(user.id, planId, cueId, { listeningApproved: true, version });

    const report = await readinessForPlan(user.id, planId);

    expect(report.checks.map((check) => check.code)).toEqual(["MISSING_EXPORT"]);
    await expect(confirmReadiness(user.id, planId, report.version)).rejects.toMatchObject({ status: 422, code: "NOT_READY" });
  });

  it("passes once the export is completed and the cue is approved", async () => {
    const revisionId = await newRevision(1300);
    await exportNow(user.id, revisionId, `e-${randomUUID()}`);
    const { planId, cueId, version } = await planWithCue(revisionId);
    const approved = await updateCue(user.id, planId, cueId, { listeningApproved: true, version });

    const ready = await confirmReadiness(user.id, planId, approved.version);

    expect(ready.state).toBe("READY");
  });

  it("returns cue display details so the page does not show raw ids", async () => {
    const revisionId = await newRevision(1400);
    const { planId } = await planWithCue(revisionId);

    const plan = await getPlan(user.id, planId);

    const cue = plan.stages[0].cues[0];
    expect(cue.assetFilename).toBe("tone.wav");
    expect(cue.assetId).toBe(assetId);
    expect(cue.trimEndMs - cue.trimStartMs).toBe(1400);
    expect(cue.exportState).toBe("NONE");
  });
});

describe("cue edits", () => {
  it("clears the listening approval when the revision is replaced", async () => {
    const first = await newRevision(1500);
    const second = await newRevision(1600);
    const { planId, cueId, version } = await planWithCue(first);
    const approved = await updateCue(user.id, planId, cueId, { listeningApproved: true, version });
    expect(approved.stages[0].cues[0].listeningApprovedAt).toBeTruthy();

    const replaced = await updateCue(user.id, planId, cueId, { revisionId: second, version: approved.version });

    expect(replaced.stages[0].cues[0].revisionId).toBe(second);
    expect(replaced.stages[0].cues[0].listeningApprovedAt).toBeNull();
  });

  it("bumps the plan version when only the approval or the responsible person changes", async () => {
    const { planId, cueId, version } = await planWithCue(await newRevision(1700));

    const approved = await updateCue(user.id, planId, cueId, { listeningApproved: true, version });
    expect(approved.version).toBe(version + 1);
    const assigned = await updateCue(user.id, planId, cueId, { responsiblePerson: "DJ Nam", version: approved.version });
    expect(assigned.version).toBe(version + 2);

    await expect(updateCue(user.id, planId, cueId, { listeningApproved: false, version })).rejects.toMatchObject({ status: 409 });
  });

  it("moves a READY plan to NEEDS_REVIEW when a cue approval is withdrawn", async () => {
    const revisionId = await newRevision(1800);
    await exportNow(user.id, revisionId, `e-${randomUUID()}`);
    const { planId, cueId, version } = await planWithCue(revisionId);
    const approved = await updateCue(user.id, planId, cueId, { listeningApproved: true, version });
    const ready = await confirmReadiness(user.id, planId, approved.version);

    const withdrawn = await updateCue(user.id, planId, cueId, { listeningApproved: false, version: ready.version });

    expect(withdrawn.state).toBe("NEEDS_REVIEW");
  });
});
