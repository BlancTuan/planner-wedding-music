import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteAccount, openSession, type SessionUser } from "@/server/auth";
import { query } from "@/server/db";
import { createUpload, saveRevision } from "@/server/media/assets";
import { confirmReadiness, createPlan, getPlan, updatePlan } from "@/server/plans";
import { addPlaylistItem, createPlaylist, getPlaylist, orderPlaylist, updatePlaylist } from "@/server/playlists";

let user: SessionUser;
let revisionId: string;

beforeAll(async () => {
  const session = await openSession({ subject: `data-loss-${randomUUID()}`, displayName: "Lan" });
  user = session.user;
  const dir = mkdtempSync(path.join(tmpdir(), "wmp-loss-"));
  const wav = path.join(dir, "tone.wav");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-ac", "1", wav]);
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
});

describe("playlist updates keep fields the request left out", () => {
  it("keeps the archive flag when only the name changes", async () => {
    const created = await createPlaylist(user.id, "Tiệc", "Nhạc tiệc");
    const archived = await updatePlaylist(user.id, String(created!.id), { archived: true, version: Number(created!.version) });
    expect(archived.archivedAt).toBeTruthy();

    const renamed = await updatePlaylist(user.id, String(created!.id), { name: "Tiệc tối", version: archived.version });

    expect(renamed.name).toBe("Tiệc tối");
    expect(renamed.archivedAt).toBeTruthy();
  });

  it("unarchives only when archived is false", async () => {
    const created = await createPlaylist(user.id, "Đón khách", null);
    const archived = await updatePlaylist(user.id, String(created!.id), { archived: true, version: Number(created!.version) });

    const restored = await updatePlaylist(user.id, String(created!.id), { archived: false, version: archived.version });

    expect(restored.archivedAt).toBeNull();
  });

  it("clears the description when null is sent and keeps it when omitted", async () => {
    const created = await createPlaylist(user.id, "Lễ", "Mô tả cũ");
    const renamed = await updatePlaylist(user.id, String(created!.id), { name: "Lễ chính", version: Number(created!.version) });
    expect(renamed.description).toBe("Mô tả cũ");

    const cleared = await updatePlaylist(user.id, String(created!.id), { description: null, version: renamed.version });

    expect(cleared.description).toBeNull();
  });
});

describe("playlist reorder", () => {
  it("rejects duplicate item ids and leaves the order unchanged", async () => {
    const created = await createPlaylist(user.id, "Thứ tự", null);
    const one = await addPlaylistItem(user.id, String(created!.id), revisionId, "A", Number(created!.version));
    const two = await addPlaylistItem(user.id, String(created!.id), revisionId, "B", one.version);
    const [first] = two.items.map((item) => String(item.id));

    await expect(orderPlaylist(user.id, String(created!.id), [first, first], two.version)).rejects.toMatchObject({
      status: 422,
      code: "ORDER_MISMATCH",
    });

    const after = await getPlaylist(user.id, String(created!.id));
    expect(after.items.map((item) => item.note)).toEqual(["A", "B"]);
    expect(after.items.map((item) => Number(item.position))).toEqual([0, 1]);
    expect(after.version).toBe(two.version);
  });

  it("persists a valid reorder", async () => {
    const created = await createPlaylist(user.id, "Đảo", null);
    const one = await addPlaylistItem(user.id, String(created!.id), revisionId, "A", Number(created!.version));
    const two = await addPlaylistItem(user.id, String(created!.id), revisionId, "B", one.version);
    const ids = two.items.map((item) => String(item.id));

    await orderPlaylist(user.id, String(created!.id), [ids[1], ids[0]], two.version);

    const after = await getPlaylist(user.id, String(created!.id));
    expect(after.items.map((item) => item.note)).toEqual(["B", "A"]);
  });
});

describe("plan PATCH keeps fields the request left out", () => {
  it("keeps date, location and notes on a name-only change", async () => {
    const plan = await createPlan(user.id, { name: "Cưới Lan", template: "EMPTY" });
    const filled = await updatePlan(user.id, plan.id, {
      weddingDate: "2027-05-01",
      location: "Hội An",
      notes: "Mang loa dự phòng",
      version: plan.version,
    });

    const renamed = await updatePlan(user.id, plan.id, { name: "Cưới Lan và Minh", version: filled.version });

    expect(renamed.name).toBe("Cưới Lan và Minh");
    expect(renamed.weddingDate).toBe("2027-05-01");
    expect(renamed.location).toBe("Hội An");
    expect(renamed.notes).toBe("Mang loa dự phòng");
  });

  it("clears a field only when null is sent", async () => {
    const plan = await createPlan(user.id, { name: "Cưới Hoa", template: "EMPTY" });
    const filled = await updatePlan(user.id, plan.id, { location: "Huế", notes: "Ghi chú", version: plan.version });

    const cleared = await updatePlan(user.id, plan.id, { location: null, version: filled.version });

    expect(cleared.location).toBeNull();
    expect(cleared.notes).toBe("Ghi chú");
  });

  it("moves a READY plan to NEEDS_REVIEW and marks old packages outdated", async () => {
    const plan = await createPlan(user.id, { name: "Cưới Mai", template: "EMPTY" });
    const ready = await confirmReadiness(user.id, plan.id, plan.version);
    expect(ready.state).toBe("READY");
    await query(
      `INSERT INTO handoff_packages (id, plan_id, plan_version, state, is_outdated) VALUES ($1, $2, $3, 'COMPLETED', false)`,
      [randomUUID(), plan.id, ready.version],
    );

    const edited = await updatePlan(user.id, plan.id, { notes: "Đổi giờ", version: ready.version });

    expect(edited.state).toBe("NEEDS_REVIEW");
    expect(edited.listeningApprovedAt).toBeNull();
    const packages = await query<{ isOutdated: boolean }>(`SELECT is_outdated AS "isOutdated" FROM handoff_packages WHERE plan_id = $1`, [plan.id]);
    expect(packages.every((item) => item.isOutdated)).toBe(true);
  });

  it("rejects a stale version without saving", async () => {
    const plan = await createPlan(user.id, { name: "Cưới Cúc", template: "EMPTY" });
    await updatePlan(user.id, plan.id, { location: "Đà Lạt", version: plan.version });

    await expect(updatePlan(user.id, plan.id, { location: "Sapa", version: plan.version })).rejects.toMatchObject({ status: 409 });

    expect((await getPlan(user.id, plan.id)).location).toBe("Đà Lạt");
  });
});
