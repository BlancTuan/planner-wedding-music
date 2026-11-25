import { describe, expect, it } from "vitest";
import { foldVi, publicCatalogFilter } from "@/server/catalog/search";

describe("Vietnamese search", () => {
  it("matches accented and unaccented text, including đ", () => {
    expect(foldVi("Đám cưới")).toBe(foldVi("dam cuoi"));
    expect(foldVi("Lễ đường")).toBe(foldVi("le duong"));
  });

  it("keeps only published tracks in public results", () => {
    const rows = [
      { id: "1", title: "Mùa yêu", publishState: "PUBLISHED" },
      { id: "2", title: "Mùa yêu nháp", publishState: "DRAFT" },
      { id: "3", title: "Mùa cũ", publishState: "UNPUBLISHED" },
    ];
    const found = publicCatalogFilter(rows, "mua yeu");
    expect(found.map((row) => row.id)).toEqual(["1"]);
  });
});
