import { z } from "zod";
import { requireUser } from "@/server/auth";
import { errorResponse, json, parseBody, readJson } from "@/server/http";
import { confirmReadiness } from "@/server/plans";

export async function POST(request: Request, context: { params: Promise<{ planId: string }> }) {
  try {
    const user = await requireUser(request);
    const { planId } = await context.params;
    const body = parseBody(z.object({ version: z.number().int() }), await readJson(request));
    return json(await confirmReadiness(user.id, planId, body.version));
  } catch (error) {
    return errorResponse(error);
  }
}
