import { foldVi } from "@/server/catalog/search";

export function assignExportNames(titles: string[]): string[] {
  const used = new Set<string>();
  return titles.map((title, index) => {
    const slug = foldVi(title)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "bai-hat";
    let name = `${String(index + 1).padStart(2, "0")}-${slug}.mp3`;
    let suffix = 2;
    while (used.has(name)) {
      name = `${String(index + 1).padStart(2, "0")}-${slug}-${suffix}.mp3`;
      suffix += 1;
    }
    used.add(name);
    return name;
  });
}

export function requiredPackageEntries(
  stages: Array<{ status: string; cues: Array<{ fileName: string }> }>,
): string[] {
  const audio = stages
    .filter((stage) => stage.status === "MUSIC_REQUIRED")
    .flatMap((stage) => stage.cues.map((cue) => cue.fileName));
  return [...audio, "huong-dan.pdf", "huong-dan.csv"];
}

export function packageIsOutdated(packagePlanVersion: number, currentPlanVersion: number): boolean {
  return packagePlanVersion !== currentPlanVersion;
}
