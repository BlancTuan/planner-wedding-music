import { requireUser } from "@/server/auth";
import { errorResponse, json } from "@/server/http";
import { cancelImport, getImport } from "@/server/youtube/imports";

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await requireUser(request);
    const { jobId } = await context.params;
    return json(await getImport(user.id, jobId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await requireUser(request);
    const { jobId } = await context.params;
    return json(await cancelImport(user.id, jobId));
  } catch (error) {
    return errorResponse(error);
  }
}
