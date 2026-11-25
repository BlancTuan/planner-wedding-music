import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteAccount, openSession, type SessionUser } from "@/server/auth";
import { one, query } from "@/server/db";
import { buildHandoff, getPackage, listPackages, readPackageFile } from "@/server/handoff";
import { createUpload, saveRevision } from "@/server/media/assets";
import { addCue, addStage, confirmReadiness, createPlan, deletePlan, getPlan, updateCue, updatePlan } from "@/server/plans";
import { safePath } from "@/server/storage";
import { exportNow } from "../helpers/exports";

let user: SessionUser;
let other: SessionUser;
let assetId: string;
const dir = mkdtempSync(path.join(tmpdir(), "wmp-handoff-"));

async function exportedRevision(trimEndMs: number) {
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
  const exported = await exportNow(user.id, String(revision.id), `e-${randomUUID()}`);
  return { revisionId: String(revision.id), exportId: String(exported.id) };
}

async function readyPlan(revisionId: string, instruction: string) {
  const plan = await createPlan(user.id, { name: `Lễ ${randomUUID().slice(0, 6)}`, template: "EMPTY" });
  const dated = await updatePlan(user.id, plan.id, {
    weddingDate: "2027-05-01",
    notes: "Loa chính bên trái sân khấu",
    version: plan.version,
  });
  const staged = await addStage(user.id, plan.id, "Lối vào cô dâu", dated.version);
  const cued = await addCue(user.id, plan.id, staged.stages[0].id, { revisionId, instruction, version: staged.version });
  const cueId = cued.stages[0].cues[0].id;
  const assigned = await updateCue(user.id, plan.id, cueId, {
    responsiblePerson: "Anh Minh",
    listeningApproved: true,
    version: cued.version,
  });
  const ready = await confirmReadiness(user.id, plan.id, assigned.version);
  return { planId: plan.id, version: ready.version };
}

function unzipEntry(zip: Buffer, entry: string): Buffer {
  const zipPath = path.join(dir, `${randomUUID()}.zip`);
  writeFileSync(zipPath, zip);
  return execFileSync("unzip", ["-p", zipPath, entry]);
}

function pdfText(pdf: Buffer): string {
  const pdfPath = path.join(dir, `${randomUUID()}.pdf`);
  writeFileSync(pdfPath, pdf);
  return execFileSync("pdftotext", ["-enc", "UTF-8", pdfPath, "-"], { encoding: "utf8" });
}

beforeAll(async () => {
  user = (await openSession({ subject: `handoff-${randomUUID()}`, displayName: "Bàn giao" })).user;
  other = (await openSession({ subject: `handoff-other-${randomUUID()}`, displayName: "Khác" })).user;
  const wav = path.join(dir, "tone.wav");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-ac", "1", wav]);
  const upload = await createUpload({ userId: user.id, filename: "tone.wav", bytes: readFileSync(wav), idempotencyKey: `u-${randomUUID()}` });
  assetId = String(upload.assetId);
});

afterAll(async () => {
  await deleteAccount(user, true, user.version);
  await deleteAccount(other, true, other.version);
});

describe("handoff documents", () => {
  it("writes plan version, date, notes, instruction and responsible person to the CSV", async () => {
    const { revisionId } = await exportedRevision(1500);
    const { planId, version } = await readyPlan(revisionId, "Khi MC mời cô dâu");

    const pack = await buildHandoff(user.id, planId);
    const csv = unzipEntry(await readPackageFile(user.id, planId, pack.id), "huong-dan.csv").toString("utf8");

    expect(csv).toContain(`Phiên bản,"${version}"`);
    expect(csv).toContain(`Ngày cưới,"2027-05-01"`);
    expect(csv).toContain(`Ghi chú,"Loa chính bên trái sân khấu"`);
    expect(csv).toContain(`"Khi MC mời cô dâu"`);
    expect(csv).toContain(`"Anh Minh"`);
  });

  it("writes plan version, date, notes and responsible person to the PDF", async () => {
    const { revisionId } = await exportedRevision(1600);
    const { planId, version } = await readyPlan(revisionId, "Khi MC mời cô dâu");

    const pack = await buildHandoff(user.id, planId);
    const text = pdfText(unzipEntry(await readPackageFile(user.id, planId, pack.id), "huong-dan.pdf"));

    expect(text).toContain(`Phiên bản: ${version}`);
    expect(text).toContain("Ngày cưới: 2027-05-01");
    expect(text).toContain("Ghi chú: Loa chính bên trái sân khấu");
    expect(text).toContain("Người phụ trách: Anh Minh");
  });

  it("neutralizes spreadsheet formulas in user text", async () => {
    const { revisionId } = await exportedRevision(1700);
    const { planId } = await readyPlan(revisionId, "=HYPERLINK(\"http://x\")");

    const pack = await buildHandoff(user.id, planId);
    const csv = unzipEntry(await readPackageFile(user.id, planId, pack.id), "huong-dan.csv").toString("utf8");

    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).not.toContain(`"=HYPERLINK`);
  });
});

describe("handoff packages", () => {
  it("lists earlier packages newest first and records their size", async () => {
    const { revisionId } = await exportedRevision(1800);
    const { planId } = await readyPlan(revisionId, "Khi MC mời");
    const first = await buildHandoff(user.id, planId);
    const second = await buildHandoff(user.id, planId);

    const list = await listPackages(user.id, planId);

    expect(list.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(list[0].byteSize).toBeGreaterThan(0);
    await expect(listPackages(other.id, planId)).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a package when a required MP3 file is missing and stores nothing", async () => {
    const { revisionId, exportId } = await exportedRevision(1900);
    const { planId } = await readyPlan(revisionId, "Khi MC mời");
    const row = await one<{ storageKey: string }>(`SELECT storage_key AS "storageKey" FROM export_artifacts WHERE id = $1`, [exportId]);
    const file = safePath(row!.storageKey);
    renameSync(file, `${file}.moved`);
    try {
      await expect(buildHandoff(user.id, planId)).rejects.toMatchObject({ status: 422, code: "INCOMPLETE_PACKAGE" });
      expect(await listPackages(user.id, planId)).toEqual([]);
    } finally {
      renameSync(`${file}.moved`, file);
    }
  });

  it("hides another user's package and its file", async () => {
    const { revisionId } = await exportedRevision(2000);
    const { planId } = await readyPlan(revisionId, "Khi MC mời");
    const pack = await buildHandoff(user.id, planId);

    await expect(getPackage(other.id, planId, pack.id)).rejects.toMatchObject({ status: 404 });
    await expect(readPackageFile(other.id, planId, pack.id)).rejects.toMatchObject({ status: 404 });
  });

  it("returns 404 when the package file is gone from storage", async () => {
    const { revisionId } = await exportedRevision(2100);
    const { planId } = await readyPlan(revisionId, "Khi MC mời");
    const pack = await buildHandoff(user.id, planId);
    const row = await one<{ storageKey: string }>(`SELECT storage_key AS "storageKey" FROM handoff_packages WHERE id = $1`, [pack.id]);
    const file = safePath(row!.storageKey);
    renameSync(file, `${file}.moved`);
    try {
      await expect(readPackageFile(user.id, planId, pack.id)).rejects.toMatchObject({ status: 404, code: "PACKAGE_FILE_MISSING" });
    } finally {
      renameSync(`${file}.moved`, file);
    }
  });

  it("builds every package from one plan version even when the plan is edited at the same time", async () => {
    const { revisionId } = await exportedRevision(2200);
    const { planId, version } = await readyPlan(revisionId, "Khi MC mời");

    const [built, edited] = await Promise.allSettled([
      buildHandoff(user.id, planId),
      updatePlan(user.id, planId, { notes: "Đổi loa", version }),
    ]);

    expect(edited.status).toBe("fulfilled");
    if (built.status === "fulfilled") {
      const csv = unzipEntry(await readPackageFile(user.id, planId, built.value.id), "huong-dan.csv").toString("utf8");
      expect(built.value.planVersion).toBe(version);
      expect(csv).toContain(`Phiên bản,"${version}"`);
      expect(csv).toContain(`Ghi chú,"Loa chính bên trái sân khấu"`);
    } else {
      expect(built.reason).toMatchObject({ status: 422 });
    }
  });
});

describe("handoff storage", () => {
  async function usedBytes() {
    const row = await one<{ used: string }>("SELECT storage_used_bytes::text AS used FROM users WHERE id = $1", [user.id]);
    return Number(row?.used);
  }

  function packageFiles() {
    const root = path.resolve("storage", "packages");
    return existsSync(root) ? readdirSync(root).length : 0;
  }

  it("charges the package size to the user and refunds it when the plan is deleted", async () => {
    const { revisionId } = await exportedRevision(2300);
    const { planId } = await readyPlan(revisionId, "Khi MC mời");
    const before = await usedBytes();

    const pack = await buildHandoff(user.id, planId);

    expect((await usedBytes()) - before).toBe(pack.byteSize);
    const plan = await getPlan(user.id, planId);
    await deletePlan(user.id, planId, true, plan.version);
    expect(await usedBytes()).toBe(before);
  });

  it("rejects a package over the quota and keeps no file or row", async () => {
    const { revisionId } = await exportedRevision(2400);
    const { planId } = await readyPlan(revisionId, "Khi MC mời");
    const used = await usedBytes();
    const files = packageFiles();
    await query("UPDATE users SET storage_quota_bytes = $2 WHERE id = $1", [user.id, used + 10]);
    try {
      await expect(buildHandoff(user.id, planId)).rejects.toMatchObject({ status: 413, code: "QUOTA_EXCEEDED" });
    } finally {
      await query("UPDATE users SET storage_quota_bytes = DEFAULT WHERE id = $1", [user.id]);
    }

    expect(await listPackages(user.id, planId)).toEqual([]);
    expect(await usedBytes()).toBe(used);
    expect(packageFiles()).toBe(files);
  });
});
