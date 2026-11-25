import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppError } from "@/server/errors";
import { getEnv } from "@/server/env";

export function storageRoot(): string {
  return path.resolve(process.cwd(), getEnv().storageRoot);
}

export function safePath(key: string): string {
  if (!key || key.includes("..") || path.isAbsolute(key)) {
    throw new AppError(400, "BAD_KEY", "Khoá tệp không hợp lệ.");
  }
  const root = storageRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(`${root}${path.sep}`)) {
    throw new AppError(400, "BAD_KEY", "Khoá tệp không hợp lệ.");
  }
  return full;
}

export async function writeStorage(key: string, data: Buffer): Promise<void> {
  const full = safePath(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function readStorage(key: string): Promise<Buffer> {
  return readFile(safePath(key));
}

export async function removeStorage(key: string): Promise<void> {
  await rm(safePath(key), { force: true });
}

const TEMP_SESSION_DIR = /^temporary-audio\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function removeTemporarySessionDir(sessionId: string): Promise<void> {
  const key = `temporary-audio/${sessionId}`;
  if (!TEMP_SESSION_DIR.test(key)) throw new AppError(400, "BAD_KEY", "Khoá tệp không hợp lệ.");
  await rm(safePath(key), { recursive: true, force: true });
}

export function newKey(folder: string, extension: string): string {
  return `${folder}/${randomUUID()}${extension}`;
}
