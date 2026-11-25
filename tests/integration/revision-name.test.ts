import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as saveRevisionRoute } from "@/app/api/assets/[assetId]/revisions/route";
import { deleteAccount, openSession, type SessionUser } from "@/server/auth";
import { getRevision, listLibrary, listRevisions, registerReadyAsset, saveRevision } from "@/server/media/assets";

let user: SessionUser;
let token: string;
let assetId: string;

const trim = { trimStartMs: 0, trimEndMs: 1500, fadeInMs: 0, fadeOutMs: 0, gainDb: 0 };

beforeAll(async () => {
  const session = await openSession({ subject: `revision-name-${randomUUID()}`, displayName: "Đặt tên bản chỉnh" });
  user = session.user;
  token = session.token;
  const dir = mkdtempSync(path.join(tmpdir(), "wmp-revision-name-"));
  const file = path.join(dir, "tone.wav");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-ac", "1", file]);
  assetId = await registerReadyAsset({ userId: user.id, sourceType: "UPLOAD", filename: "tone.wav", bytes: readFileSync(file) });
});

afterAll(async () => {
  await deleteAccount(user, true, user.version);
});

function post(body: unknown) {
  return saveRevisionRoute(
    new Request("http://localhost/api", {
      method: "POST",
      headers: { cookie: `wmp_session=${token}`, "idempotency-key": `rev-${randomUUID()}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ assetId }) },
  );
}

describe("naming a saved revision", () => {
  it("stores a trimmed name and returns it everywhere a revision is read", async () => {
    const saved = (await saveRevision({
      userId: user.id,
      assetId,
      idempotencyKey: `rev-${randomUUID()}`,
      name: "  Bản vào lễ, bỏ đoạn đầu  ",
      ...trim,
    })) as { id: string; name: string };

    expect(saved.name).toBe("Bản vào lễ, bỏ đoạn đầu");
    expect((await getRevision(user.id, saved.id)).name).toBe("Bản vào lễ, bỏ đoạn đầu");
    expect(await listRevisions(user.id, assetId)).toEqual([expect.objectContaining({ id: saved.id, name: "Bản vào lễ, bỏ đoạn đầu" })]);
    const library = await listLibrary(user.id, "", "", "");
    expect(library[0].revisions).toEqual([expect.objectContaining({ id: saved.id, name: "Bản vào lễ, bỏ đoạn đầu" })]);
  });

  it("treats a blank name as no name", async () => {
    const saved = (await saveRevision({
      userId: user.id,
      assetId,
      idempotencyKey: `rev-${randomUUID()}`,
      name: "   ",
      ...trim,
      trimEndMs: 2000,
    })) as { name: string | null };
    expect(saved.name).toBeNull();
  });

  it("requires a non-blank name on the route and rejects one over 120 characters", async () => {
    const missing = await post({ ...trim, trimEndMs: 2500 });
    expect(missing.status).toBe(422);

    const blank = await post({ ...trim, trimEndMs: 2500, name: "   " });
    expect(blank.status).toBe(422);

    const tooLong = await post({ ...trim, trimEndMs: 2700, name: "a".repeat(121) });
    expect(tooLong.status).toBe(422);

    const named = await post({ ...trim, trimEndMs: 2600, name: "  Bản dự phòng  " });
    expect(named.status).toBe(201);
    expect((await named.json()).name).toBe("Bản dự phòng");
  });

  it("does not replay a saved revision under another name with the same key", async () => {
    const key = `rev-${randomUUID()}`;
    await saveRevision({ userId: user.id, assetId, idempotencyKey: key, name: "Một", ...trim, trimEndMs: 2800 });
    await expect(
      saveRevision({ userId: user.id, assetId, idempotencyKey: key, name: "Hai", ...trim, trimEndMs: 2800 }),
    ).rejects.toMatchObject({ status: expect.any(Number) });
  });
});
