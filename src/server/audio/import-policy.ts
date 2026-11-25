import { getEnv } from "@/server/env";

export function inspectImportSource(source: { kind: "youtube" | "upload" | "fixture" }): {
  state: "AVAILABLE" | "BLOCKED";
  reasonCode: string;
} {
  if (source.kind === "youtube") {
    return { state: "AVAILABLE", reasonCode: "YOUTUBE_DOWNLOAD" };
  }
  if (source.kind === "fixture") {
    if (!getEnv().authTestMode) return { state: "BLOCKED", reasonCode: "FIXTURE_DISABLED" };
    return { state: "AVAILABLE", reasonCode: "LOCAL_FIXTURE" };
  }
  return { state: "AVAILABLE", reasonCode: "USER_UPLOAD" };
}
