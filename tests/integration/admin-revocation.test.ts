import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteAccount, openSession, requireAdmin, type SessionUser } from "@/server/auth";
import { one, query } from "@/server/db";

let user: SessionUser;
let token: string;

beforeAll(async () => {
  const session = await openSession({ subject: `removed-admin-${randomUUID()}`, displayName: "Cựu quản trị" });
  user = session.user;
  token = session.token;
  await query("UPDATE users SET role = 'ADMIN' WHERE id = $1", [user.id]);
});

afterAll(async () => {
  await deleteAccount(user, true, user.version);
});

describe("administrator removal", () => {
  it("refuses an existing session whose subject is no longer on the admin list", async () => {
    const request = new Request("http://localhost/api/admin/catalog", { headers: { cookie: `wmp_session=${token}` } });

    await expect(requireAdmin(request)).rejects.toMatchObject({ status: 403 });
    const row = await one<{ role: string }>("SELECT role FROM users WHERE id = $1", [user.id]);
    expect(row?.role).toBe("USER");
  });
});
