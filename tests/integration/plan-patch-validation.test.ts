import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PATCH } from "@/app/api/plans/[planId]/route";
import { GET as listPlans, POST as createPlanRoute } from "@/app/api/plans/route";
import { deleteAccount, openSession, type SessionUser } from "@/server/auth";
import { createPlan } from "@/server/plans";

let user: SessionUser;
let token: string;

function patch(planId: string, body: unknown, cookie = `wmp_session=${encodeURIComponent(token)}`) {
  return PATCH(
    new Request(`http://127.0.0.1/api/plans/${planId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ planId }) },
  );
}

beforeAll(async () => {
  const session = await openSession({ subject: `patch-${randomUUID()}`, displayName: "Sửa" });
  user = session.user;
  token = session.token;
});

afterAll(async () => {
  await deleteAccount(user, true, user.version);
});

describe("plan PATCH validation", () => {
  it.each([["2027-02-30"], ["2027-13-01"], ["2027-00-10"]])("rejects the impossible date %s with 422", async (weddingDate) => {
    const plan = await createPlan(user.id, { name: "Ngày", template: "EMPTY" });
    const response = await patch(plan.id, { weddingDate, version: plan.version });
    expect(response.status).toBe(422);
  });

  it("accepts a real leap day", async () => {
    const plan = await createPlan(user.id, { name: "Nhuận", template: "EMPTY" });
    const response = await patch(plan.id, { weddingDate: "2028-02-29", version: plan.version });
    expect(response.status).toBe(200);
    expect((await response.json()).weddingDate).toBe("2028-02-29");
  });

  it("rejects a whitespace-only name", async () => {
    const plan = await createPlan(user.id, { name: "Tên", template: "EMPTY" });
    const response = await patch(plan.id, { name: "   ", version: plan.version });
    expect(response.status).toBe(422);
  });

  it("treats a malformed session cookie as signed out instead of failing", async () => {
    const response = await listPlans(new Request("http://127.0.0.1/api/plans", { headers: { cookie: "wmp_session=%E0%A4%A" } }));
    expect(response.status).toBe(401);
  });

  it("rejects an unknown time zone on update and on create", async () => {
    const plan = await createPlan(user.id, { name: "Múi giờ", template: "EMPTY" });

    expect((await patch(plan.id, { timeZone: "Mars/Base", version: plan.version })).status).toBe(422);
    expect((await patch(plan.id, { timeZone: "Asia/Bangkok", version: plan.version })).status).toBe(200);
    const created = await createPlanRoute(
      new Request("http://127.0.0.1/api/plans", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: `wmp_session=${encodeURIComponent(token)}` },
        body: JSON.stringify({ name: "Sai múi giờ", template: "EMPTY", timeZone: "Not/AZone" }),
      }),
    );
    expect(created.status).toBe(422);
  });
});
