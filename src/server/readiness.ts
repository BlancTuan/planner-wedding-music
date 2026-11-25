export type ReadinessCue = {
  id: string;
  revisionId: string | null;
  assetStatus: "READY" | "FAILED" | "MISSING";
  exportState: "NONE" | "QUEUED" | "PROCESSING" | "VERIFYING" | "COMPLETED" | "FAILED" | "CANCELLED";
  listeningApproved: boolean;
  permission: "PREVIEW_ALLOWED" | "METADATA_ONLY" | "RESTRICTED";
  durationDeltaMs: number | null;
};

export type ReadinessStage = {
  id: string;
  name: string;
  status: "MUSIC_REQUIRED" | "NO_MUSIC" | "SKIPPED";
  cues: ReadinessCue[];
};

export type ReadinessCheck = {
  code: string;
  message: string;
  stageId: string;
  cueId?: string;
};

export function evaluateReadiness(stages: ReadinessStage[]): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];
  for (const stage of stages) {
    if (stage.status !== "MUSIC_REQUIRED") continue;
    if (stage.cues.length === 0) {
      checks.push({
        code: "STAGE_MISSING_CUES",
        stageId: stage.id,
        message: `Phần "${stage.name}" cần nhạc nhưng chưa có bài.`,
      });
      continue;
    }
    for (const cue of stage.cues) {
      if (!cue.revisionId || cue.assetStatus === "MISSING") {
        checks.push({
          code: "MISSING_SOURCE",
          stageId: stage.id,
          cueId: cue.id,
          message: `Phần "${stage.name}" thiếu nguồn nhạc.`,
        });
      } else if (cue.assetStatus !== "READY") {
        checks.push({
          code: "UNAVAILABLE_MEDIA",
          stageId: stage.id,
          cueId: cue.id,
          message: `Phần "${stage.name}" có nguồn nhạc chưa sẵn sàng.`,
        });
      }
      if (cue.permission === "RESTRICTED") {
        checks.push({
          code: "PERMISSION_PROBLEM",
          stageId: stage.id,
          cueId: cue.id,
          message: `Phần "${stage.name}" dùng bản nhạc không được phép.`,
        });
      }
      if (cue.exportState === "FAILED") {
        checks.push({
          code: "FAILED_EXPORT",
          stageId: stage.id,
          cueId: cue.id,
          message: `Phần "${stage.name}" có bản xuất MP3 thất bại.`,
        });
      } else if (cue.exportState === "NONE" || cue.exportState === "CANCELLED") {
        checks.push({
          code: "MISSING_EXPORT",
          stageId: stage.id,
          cueId: cue.id,
          message: `Phần "${stage.name}" chưa có bản MP3 đã xuất.`,
        });
      } else if (cue.exportState === "QUEUED" || cue.exportState === "PROCESSING" || cue.exportState === "VERIFYING") {
        checks.push({
          code: "UNFINISHED_EXPORT",
          stageId: stage.id,
          cueId: cue.id,
          message: `Phần "${stage.name}" chưa xuất xong MP3.`,
        });
      }
      if (!cue.listeningApproved) {
        checks.push({
          code: "UNREVIEWED_CUE",
          stageId: stage.id,
          cueId: cue.id,
          message: `Phần "${stage.name}" chưa được nghe và xác nhận.`,
        });
      }
      if (cue.durationDeltaMs !== null && Math.abs(cue.durationDeltaMs) > 200) {
        checks.push({
          code: "DURATION_MISMATCH",
          stageId: stage.id,
          cueId: cue.id,
          message: `Phần "${stage.name}" có độ dài file lệch so với đoạn đã chọn.`,
        });
      }
    }
  }
  return checks;
}

export function invalidateApproval(plan: {
  state: string;
  version: number;
  listeningApprovedAt: string | null;
}): { state: string; version: number; listeningApprovedAt: null } {
  if (plan.state !== "READY") {
    return { state: plan.state, version: plan.version + 1, listeningApprovedAt: null };
  }
  return { state: "NEEDS_REVIEW", version: plan.version + 1, listeningApprovedAt: null };
}
