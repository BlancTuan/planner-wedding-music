import type { ZodType } from "zod";
import { requireUser } from "@/server/auth";
import { errorResponse, json, parseBody, readJson } from "@/server/http";

type Context<P> = { params: Promise<P> };

export function planRoute<P, B>(
  schema: ZodType<B> | null,
  handler: (userId: string, params: P, body: B) => Promise<unknown>,
  status = 200,
) {
  return async (request: Request, context: Context<P>) => {
    try {
      const user = await requireUser(request);
      const params = await context.params;
      const body = schema ? parseBody(schema, await readJson(request)) : (undefined as B);
      return json(await handler(user.id, params, body), status);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
