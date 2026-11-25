import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deleteAccount, openSession, userFromToken } from "@/server/auth";
import { buildHandoff, readPackageFile } from "@/server/handoff";
import { createUpload, getOwnedAsset, saveRevision } from "@/server/media/assets";
import { addCue, addStage, confirmReadiness, createPlan, updateCue } from "@/server/plans";
import { addPlaylistItem, createPlaylist, updatePlaylist } from "@/server/playlists";
import { createImport } from "@/server/youtube/imports";
import { exportNow } from "../helpers/exports";

describe("persisted wedding music flow", () => {
  it("isolates users and exports a real handoff package", async () => {
    const suffix = randomUUID();
    const first = await openSession({ subject: `flow-a-${suffix}`, displayName: "An" });
    const second = await openSession({ subject: `flow-b-${suffix}`, displayName: "Bình" });
    const again = await openSession({ subject: `flow-a-${suffix}`, displayName: "An" });
    expect(again.user.id).toBe(first.user.id);
    const loaded = await userFromToken(again.token);
    expect(loaded?.id).toBe(first.user.id);
    expect(loaded?.displayName).toBe("An");

    const dir = mkdtempSync(path.join(tmpdir(), "wmp-flow-"));
    const wav = path.join(dir, "tone.wav");
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-ac", "1", wav]);
    const upload = await createUpload({
      userId: first.user.id,
      filename: "tone.wav",
      bytes: readFileSync(wav),
      idempotencyKey: `upload-${suffix}`,
    });
    expect(upload.state).toBe("READY");
    await expect(getOwnedAsset(second.user.id, String(upload.assetId))).rejects.toThrow();

    const revision = await saveRevision({
      userId: first.user.id,
      assetId: String(upload.assetId),
      idempotencyKey: `rev-${suffix}`,
      trimStartMs: 0,
      trimEndMs: 2000,
      fadeInMs: 50,
      fadeOutMs: 50,
      gainDb: -1,
    });
    const exported = await exportNow(first.user.id, String(revision.id), `exp-${suffix}`);
    expect(exported.state).toBe("COMPLETED");
    expect(exported.durationMs).toBeGreaterThan(800);

    const playlist = await createPlaylist(first.user.id, "Lối vào", null);
    await expect(updatePlaylist(first.user.id, String(playlist.id), { name: "Cũ", version: 0 })).rejects.toThrow();
    const withItem = await addPlaylistItem(first.user.id, String(playlist.id), String(revision.id), "Mở đầu", Number(playlist.version));
    expect(withItem.items).toHaveLength(1);

    const plan = await createPlan(first.user.id, { name: `Lễ ${suffix.slice(0, 8)}`, template: "EMPTY" });
    const staged = await addStage(first.user.id, plan.id, "Lối vào cô dâu", plan.version);
    const cued = await addCue(first.user.id, plan.id, staged.stages[0].id, {
      revisionId: String(revision.id),
      instruction: "Bắt đầu khi MC giới thiệu.",
      version: staged.version,
    });
    const approved = await updateCue(first.user.id, plan.id, cued.stages[0].cues[0].id, {
      listeningApproved: true,
      version: cued.version,
    });
    const ready = await confirmReadiness(first.user.id, plan.id, approved.version);
    expect(ready.state).toBe("READY");
    const pack = await buildHandoff(first.user.id, plan.id);
    const zip = await readPackageFile(first.user.id, plan.id, pack.id);
    const zipPath = path.join(dir, "handoff.zip");
    writeFileSync(zipPath, zip);
    const listing = execFileSync("python3", ["-c", "import zipfile,sys; print('\\n'.join(sorted(zipfile.ZipFile(sys.argv[1]).namelist())))", zipPath], { encoding: "utf8" });
    expect(listing).toContain("huong-dan.pdf");
    expect(listing).toContain("huong-dan.csv");
    expect(listing).toContain(".mp3");

    const fixture = await createImport(first.user.id, "fixture:tone", `fix-${suffix}`);
    expect(fixture.state).toBe("READY_FOR_EDITING");
    expect(fixture.assetId).toBeTruthy();
    await expect(createImport(first.user.id, "https://example.com/watch?v=dQw4w9WgXcQ", `bad-${suffix}`)).rejects.toThrow();

    await deleteAccount(first.user, true, first.user.version);
    await deleteAccount(second.user, true, second.user.version);
  });
});