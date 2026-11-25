import { z } from "zod";
import { requireUser } from "@/server/auth";
import { errorResponse, json, parseBody, readJson } from "@/server/http";
import { createPlan, listPlans } from "@/server/plans";
import { timeZoneField } from "@/server/plans/schemas";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return json({ items: await listPlans(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = parseBody(
      z.object({
        name: z.string().min(1).max(160),
        template: z.enum(["EMPTY", "VIETNAMESE_SUGGESTED"]),
        timeZone: timeZoneField.optional(),
      }),
      await readJson(request),
    );
    return json(await createPlan(user.id, body), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
