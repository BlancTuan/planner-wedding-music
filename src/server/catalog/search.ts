export function foldVi(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("vi")
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function publicCatalogFilter<T extends { title: string; publishState: string }>(
  rows: T[],
  query: string,
): T[] {
  const folded = foldVi(query.trim());
  return rows.filter(
    (row) => row.publishState === "PUBLISHED" && foldVi(row.title).includes(folded),
  );
}
