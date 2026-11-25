import { describe, expect, it } from "vitest";
import { nextCatalogVersion, requireAdmin } from "@/server/admin/authz";

describe("administrator catalog", () => {
  it("denies a normal user and versions replacement media", () => {
    expect(requireAdmin("USER")).toBe("FORBIDDEN");
    expect(requireAdmin("ADMIN")).toBeNull();
    expect(nextCatalogVersion(2)).toBe(3);
  });
});
