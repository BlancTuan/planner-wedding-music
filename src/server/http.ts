import { createHash, randomBytes } from "node:crypto";
import type { ZodType } from "zod";
import { secureAttr } from "@/server/auth/cookies";
import { AppError } from "@/server/errors";

const hits = new Map<string, number[]>();

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, { status, headers });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return json(
      { error: { code: error.code, message: error.message, details: error.details ?? {} } },
      error.status,
    );
  }
  if ((error as { code?: string } | null)?.code === "22P02") {
    return json({ error: { code: "NOT_FOUND", message: "Không thấy dữ liệu.", details: {} } }, 404);
  }
  console.error(error);
  return json({ error: { code: "INTERNAL", message: "Đã có lỗi máy chủ.", details: {} } }, 500);
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  const parts = header.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  return `wmp_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=1209600${secureAttr()}`;
}

export function clearSessionCookie(): string {
  return `wmp_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secureAttr()}`;
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function rateLimit(key: string, limit = 60): void {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= limit) {
    throw new AppError(429, "RATE_LIMITED", "Bạn thao tác quá nhanh. Hãy thử lại sau một phút.");
  }
  recent.push(now);
  hits.set(key, recent);
}

export function parseBody<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", result.error.flatten());
  }
  return result.data;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError(400, "BAD_JSON", "Nội dung gửi lên không đọc được.");
  }
}
