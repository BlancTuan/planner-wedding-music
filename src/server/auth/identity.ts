import { randomUUID } from "node:crypto";

export type StoredIdentity = {
  provider: string;
  subject: string;
  userId: string;
  email?: string | null;
};

export function linkGoogleSubject(
  existing: StoredIdentity[],
  provider: string,
  subject: string,
  _email?: string | null,
): { userId: string; created: boolean } {
  if (!provider || !subject) {
    throw new Error("IDENTITY_REQUIRED");
  }
  const match = existing.find((row) => row.provider === provider && row.subject === subject);
  if (match) {
    return { userId: match.userId, created: false };
  }
  return { userId: randomUUID(), created: true };
}

export function sessionIsActive(
  session: { expiresAt: string; revokedAt: string | null },
  now: Date,
): boolean {
  if (session.revokedAt) return false;
  return new Date(session.expiresAt).getTime() > now.getTime();
}

export function deletionAllowed(input: {
  confirm: boolean;
  version: number;
  currentVersion: number;
}): boolean {
  return input.confirm === true && input.version === input.currentVersion;
}
