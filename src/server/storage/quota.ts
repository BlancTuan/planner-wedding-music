const MAX_UPLOAD_BYTES = 104857600;

export function quotaDecision(used: number, quota: number, incoming: number): string | null {
  if (incoming > MAX_UPLOAD_BYTES) return "FILE_TOO_LARGE";
  if (used + incoming > quota) return "QUOTA_EXCEEDED";
  return null;
}

export function deletionBlocked(planNames: string[]): { code: "ASSET_IN_USE"; plans: string[] } | null {
  if (planNames.length === 0) return null;
  return { code: "ASSET_IN_USE", plans: planNames };
}
