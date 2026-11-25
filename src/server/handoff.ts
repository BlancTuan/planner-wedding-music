import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import archiver from "archiver";
import PDFDocument from "pdfkit";
import { getPool, one, query } from "@/server/db";
import { AppError } from "@/server/errors";
import { assignExportNames, packageIsOutdated } from "@/server/handoff/package";
import { probeAudioFile } from "@/server/media/probe";
import { getPlan, readinessForPlan } from "@/server/plans";
import { newKey, removeStorage, safePath } from "@/server/storage";

type PlanHeader = {
  name: string;
  version: number;
  weddingDate: string | null;
  timeZone: string;
  notes: string | null;
};

type Entry = {
  stageName: string;
  fileName: string;
  durationMs: number;
  instruction: string | null;
  responsiblePerson: string | null;
  advisoryTiming: string | null;
};

export async function buildHandoff(userId: string, planId: string) {
  const client = await getPool().connect();
  const zipKey = newKey("packages", ".zip");
  let committed = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    const locked = await client.query(
      "SELECT id FROM wedding_plans WHERE id = $1 AND owner_user_id = $2 FOR SHARE",
      [planId, userId],
    );
    if (!locked.rowCount) throw new AppError(404, "NOT_FOUND", "Không thấy kế hoạch.");
    const plan = await getPlan(userId, planId, client);
    if (plan.state !== "READY") throw new AppError(422, "NOT_READY", "Chỉ xuất gói khi kế hoạch đang sẵn sàng.");
    const report = await readinessForPlan(userId, planId, client);
    if (report.checks.length > 0) throw new AppError(422, "NOT_READY", "Kế hoạch còn mục chưa đạt.", { checks: report.checks });
    const included = plan.stages.filter((stage) => stage.status === "MUSIC_REQUIRED");
    const cues = included.flatMap((stage) => stage.cues.map((cue) => ({ ...cue, stageName: stage.name })));
    const files = [];
    for (const cue of cues) {
      const found = await client.query<{ storageKey: string; durationMs: number }>(
        `SELECT storage_key AS "storageKey", duration_ms AS "durationMs"
         FROM export_artifacts WHERE revision_id = $1 AND owner_user_id = $2 AND state = 'COMPLETED'
         ORDER BY created_at DESC LIMIT 1`,
        [cue.revisionId, userId],
      );
      const file = found.rows[0];
      if (!file?.storageKey || !(await playableMp3(file.storageKey))) {
        throw new AppError(422, "INCOMPLETE_PACKAGE", "Còn điểm nhạc chưa có MP3 hoàn tất.", { cueId: cue.id });
      }
      files.push({ ...cue, storageKey: file.storageKey, durationMs: file.durationMs });
    }
    const names = assignExportNames(files.map((file) => file.stageName));
    const entries = files.map((file, index) => ({ ...file, fileName: names[index] }));
    const header: PlanHeader = {
      name: plan.name,
      version: plan.version,
      weddingDate: plan.weddingDate,
      timeZone: plan.timeZone,
      notes: plan.notes,
    };
    const pdf = await renderPdf(header, entries);
    const csv = renderCsv(header, entries);
    await writeZip(safePath(zipKey), entries, pdf, csv);
    const { size } = await stat(safePath(zipKey));
    const charged = await client.query(
      `UPDATE users SET storage_used_bytes = storage_used_bytes + $2
       WHERE id = $1 AND storage_used_bytes + $2 <= storage_quota_bytes RETURNING id`,
      [userId, size],
    );
    if (!charged.rowCount) throw new AppError(413, "QUOTA_EXCEEDED", "Gói bàn giao vượt quá dung lượng còn lại.");
    const id = randomUUID();
    await client.query(
      `INSERT INTO handoff_packages (id, plan_id, plan_version, state, storage_key, is_outdated, byte_size)
       VALUES ($1, $2, $3, 'COMPLETED', $4, false, $5)`,
      [id, planId, plan.version, zipKey, size],
    );
    await client.query("COMMIT");
    committed = true;
    return getPackage(userId, planId, id);
  } catch (error) {
    if (!committed) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    if (!committed) await removeStorage(zipKey).catch(() => undefined);
  }
}

async function playableMp3(storageKey: string): Promise<boolean> {
  try {
    const probed = await probeAudioFile(safePath(storageKey));
    return probed.ok && probed.format === "MP3";
  } catch {
    return false;
  }
}

async function writeZip(
  destination: string,
  entries: Array<{ storageKey: string; fileName: string }>,
  pdf: Buffer,
  csv: string,
) {
  await mkdir(path.dirname(destination), { recursive: true });
  const output = createWriteStream(destination);
  const archive = archiver("zip", { zlib: { level: 9 } });
  const failed = new Promise<never>((_, reject) => {
    archive.on("error", reject);
    archive.on("warning", reject);
  });
  const done = finished(output);
  archive.pipe(output);
  archive.append(pdf, { name: "huong-dan.pdf" });
  archive.append(csv, { name: "huong-dan.csv" });
  for (const entry of entries) {
    archive.file(safePath(entry.storageKey), { name: entry.fileName });
  }
  try {
    await Promise.race([Promise.all([archive.finalize(), done]), failed]);
  } catch (error) {
    archive.abort();
    output.destroy();
    throw error;
  }
}

const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function renderCsv(plan: PlanHeader, entries: Entry[]) {
  const meta = [
    ["Kế hoạch", plan.name],
    ["Phiên bản", plan.version],
    ["Ngày cưới", plan.weddingDate],
    ["Múi giờ", plan.timeZone],
    ["Ghi chú", plan.notes],
  ].map(([label, value]) => `${label},${csvCell(value)}`);
  const lines = ["thu_tu,phan,tep,do_dai_giay,huong_dan,nguoi_phu_trach,thoi_diem_goi_y"];
  entries.forEach((entry, index) => {
    lines.push(
      [
        index + 1,
        entry.stageName,
        entry.fileName,
        (entry.durationMs / 1000).toFixed(1),
        entry.instruction,
        entry.responsiblePerson,
        entry.advisoryTiming,
      ]
        .map(csvCell)
        .join(","),
    );
  });
  return `\uFEFF${meta.join("\n")}\n${lines.join("\n")}\n`;
}

async function renderPdf(plan: PlanHeader, entries: Entry[]) {
  const doc = new PDFDocument({ margin: 56 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const font = path.join(process.cwd(), "assets/fonts/BeVietnamPro-Regular.ttf");
  doc.font(font);
  doc.fontSize(20).text(plan.name);
  doc.moveDown(0.4);
  doc.fontSize(11).text(`Phiên bản: ${plan.version}`);
  if (plan.weddingDate) doc.text(`Ngày cưới: ${plan.weddingDate}`);
  doc.text(`Múi giờ: ${plan.timeZone}`);
  if (plan.notes) doc.text(`Ghi chú: ${plan.notes}`);
  doc.moveDown();
  entries.forEach((entry, index) => {
    doc.fontSize(13).text(`${index + 1}. ${entry.stageName}`);
    doc.fontSize(11).text(`Tệp: ${entry.fileName} (${(entry.durationMs / 1000).toFixed(1)} giây)`);
    if (entry.instruction) doc.text(`Cách phát: ${entry.instruction}`);
    if (entry.responsiblePerson) doc.text(`Người phụ trách: ${entry.responsiblePerson}`);
    if (entry.advisoryTiming) doc.text(`Thời điểm gợi ý: ${entry.advisoryTiming}`);
    doc.moveDown(0.6);
  });
  doc.end();
  await finished(doc);
  return Buffer.concat(chunks);
}

type PackageRow = {
  id: string;
  planVersion: number;
  state: string;
  storageKey: string | null;
  isOutdated: boolean;
  byteSize: number | null;
  createdAt: string;
};

const PACKAGE_COLUMNS = `id, plan_version AS "planVersion", state, storage_key AS "storageKey", is_outdated AS "isOutdated",
  byte_size::float8 AS "byteSize", created_at AS "createdAt"`;

export async function listPackages(userId: string, planId: string) {
  const plan = await getPlan(userId, planId);
  const rows = await query<PackageRow>(
    `SELECT ${PACKAGE_COLUMNS} FROM handoff_packages WHERE plan_id = $1 ORDER BY created_at DESC, id DESC`,
    [planId],
  );
  return rows.map(({ storageKey: _storageKey, ...item }) => ({
    ...item,
    isOutdated: item.isOutdated || packageIsOutdated(item.planVersion, plan.version),
  }));
}

export async function getPackage(userId: string, planId: string, packageId: string) {
  const plan = await getPlan(userId, planId);
  const item = await one<PackageRow>(
    `SELECT ${PACKAGE_COLUMNS} FROM handoff_packages WHERE id = $1 AND plan_id = $2`,
    [packageId, planId],
  );
  if (!item) throw new AppError(404, "NOT_FOUND", "Không thấy gói bàn giao.");
  return { ...item, isOutdated: item.isOutdated || packageIsOutdated(item.planVersion, plan.version) };
}

export async function readPackageFile(userId: string, planId: string, packageId: string) {
  const item = await getPackage(userId, planId, packageId);
  if (!item.storageKey || item.state !== "COMPLETED") throw new AppError(409, "NOT_READY", "Gói chưa hoàn tất.");
  try {
    return await readFile(safePath(item.storageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new AppError(404, "PACKAGE_FILE_MISSING", "Tệp gói bàn giao không còn, hãy tạo gói mới.");
    }
    throw error;
  }
}
