export function requireAdmin(role: string): "FORBIDDEN" | null {
  return role === "ADMIN" ? null : "FORBIDDEN";
}

export function nextCatalogVersion(current: number): number {
  return current + 1;
}
