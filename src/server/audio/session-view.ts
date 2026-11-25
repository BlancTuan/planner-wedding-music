import type { AudioEdits } from "@/server/audio/edits";

export type SessionView = {
  id: string;
  state: string;
  sourceKind: string;
  title: string | null;
  channelName: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  durationMs: number | null;
  errorCode: string | null;
  edits: AudioEdits;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
};

export type ExportView = {
  id: string;
  state: string;
  durationMs: number | null;
  errorCode: string | null;
};
