import { errorResponse } from "@/server/http";

export function handle(
  fn: (request: Request, params: Record<string, string>) => Promise<Response>,
) {
  return async (request: Request, context: { params: Promise<Record<string, string>> }) => {
    try {
      return await fn(request, await context.params);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
