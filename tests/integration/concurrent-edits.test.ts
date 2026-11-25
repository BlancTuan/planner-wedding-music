import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteAccount, openSession, type SessionUser } from "@/server/auth";
import { createUpload, saveRevision } from "@/server/media/assets";
import { addCue, addStage, createPlan, getPlan, setArchive, updateCue, updateStage } from "@/server/plans";
import { addPlaylistItem, createPlaylist, getPlaylist, removePlaylistItem } from "@/server/playlists";

let user: SessionUser;
let revisionId: string;

beforeAll(async () => {
  user = (await openSession({ subject: `concurrent-${randomUUID()}`, displayName: "Song song" })).user;
  const dir = mkdtempSync(path.join(tmpdir(), "wmp-conc-"));
  const wav = path.join(dir, "tone.wav");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-ac", "1", wav]);
  const upload = await createUpload({ userId: user.id, filename: "tone.wav", bytes: readFileSync(wav), idempotencyKey: `u-${randomUUID()}` });
  const revision = await saveRevision({
    userId: user.id,
    assetId: String(upload.assetId),
    idempotencyKey: `r-${randomUUID()}`,
    trimStartMs: 0,
    trimEndMs: 1200,
    fadeInMs: 0,
    fadeOutMs: 0,
    gainDb: 0,
  });
  revisionId = String(revision.id);
});

afterAll(async () => {
  await deleteAccount(user, true, user.version);
});

async function planWithTwoCues() {
  const plan = await createPlan(user.id, { name: `Song song ${randomUUID().slice(0, 6)}`, template: "EMPTY" });
  const staged = await addStage(user.id, plan.id, "A", plan.version);
  const one = await addCue(user.id, plan.id, staged.stages[0].id, { revisionId, instruction: "một", version: staged.version });
  return addCue(user.id, plan.id, staged.stages[0].id, { revisionId, instruction: "hai", version: one.version });
}

describe("concurrent plan edits with the same version", () => {
  it("leaves no change behind for the rejected cue update", async () => {
    const plan = await planWithTwoCues();
    const [first, second] = plan.stages[0].cues;

    const results = await Promise.allSettled([
      updateCue(user.id, plan.id, first.id, { listeningApproved: true, version: plan.version }),
      updateCue(user.id, plan.id, second.id, { listeningApproved: true, version: plan.version }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const after = await getPlan(user.id, plan.id);
    expect(after.stages[0].cues.filter((cue) => cue.listeningApprovedAt !== null)).toHaveLength(1);
    expect(after.version).toBe(plan.version + 1);
  });

  it("adds only one stage", async () => {
    const plan = await createPlan(user.id, { name: `Song song ${randomUUID().slice(0, 6)}`, template: "EMPTY" });

    await Promise.allSettled([
      addStage(user.id, plan.id, "A", plan.version),
      addStage(user.id, plan.id, "B", plan.version),
    ]);

    expect((await getPlan(user.id, plan.id)).stages).toHaveLength(1);
  });

  it("applies only one stage update", async () => {
    const plan = await planWithTwoCues();
    const stageId = plan.stages[0].id;

    await Promise.allSettled([
      updateStage(user.id, plan.id, stageId, { name: "Một", version: plan.version }),
      updateStage(user.id, plan.id, stageId, { description: "Hai", version: plan.version }),
    ]);

    const stage = (await getPlan(user.id, plan.id)).stages[0];
    expect([stage.name === "Một", stage.description === "Hai"].filter(Boolean)).toHaveLength(1);
  });

  it("does not change an archived plan until it is reopened", async () => {
    const plan = await planWithTwoCues();
    const archived = await setArchive(user.id, plan.id, true, plan.version);

    await expect(addStage(user.id, plan.id, "B", archived.version)).rejects.toMatchObject({ status: 409, code: "PLAN_ARCHIVED" });
    await expect(
      updateCue(user.id, plan.id, plan.stages[0].cues[0].id, { listeningApproved: true, version: archived.version }),
    ).rejects.toMatchObject({ code: "PLAN_ARCHIVED" });
    expect((await getPlan(user.id, plan.id)).state).toBe("ARCHIVED");
  });

  it("rejects archive with a stale version", async () => {
    const plan = await planWithTwoCues();
    await expect(setArchive(user.id, plan.id, true, plan.version - 1)).rejects.toMatchObject({ status: 409 });
  });
});

describe("concurrent playlist edits with the same version", () => {
  it("adds only one item", async () => {
    const playlist = await createPlaylist(user.id, `DS ${randomUUID().slice(0, 6)}`, null);

    await Promise.allSettled([
      addPlaylistItem(user.id, String(playlist.id), revisionId, "một", Number(playlist.version)),
      addPlaylistItem(user.id, String(playlist.id), revisionId, "hai", Number(playlist.version)),
    ]);

    expect((await getPlaylist(user.id, String(playlist.id))).items).toHaveLength(1);
  });

  it("removes only one item", async () => {
    const playlist = await createPlaylist(user.id, `DS ${randomUUID().slice(0, 6)}`, null);
    const one = await addPlaylistItem(user.id, String(playlist.id), revisionId, "một", Number(playlist.version));
    const two = await addPlaylistItem(user.id, String(playlist.id), revisionId, "hai", Number(one.version));
    const [a, b] = two.items.map((item) => String(item.id));

    await Promise.allSettled([
      removePlaylistItem(user.id, String(playlist.id), a, Number(two.version)),
      removePlaylistItem(user.id, String(playlist.id), b, Number(two.version)),
    ]);

    expect((await getPlaylist(user.id, String(playlist.id))).items).toHaveLength(1);
  });
});
