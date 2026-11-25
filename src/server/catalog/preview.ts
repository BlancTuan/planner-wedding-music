export function canPreview(track: {
  usagePermission: string;
  assetStatus: string | null;
}): boolean {
  return track.usagePermission === "PREVIEW_ALLOWED" && track.assetStatus === "READY";
}

export function listeningVolumeChangesGain(): boolean {
  return false;
}
