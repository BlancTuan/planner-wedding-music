import { requireUser } from "@/server/auth";
import { errorResponse, json } from "@/server/http";
import { cancelUpload, getUploadJob, retryUpload } from "@/server/media/assets";

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await requireUser(request);
    const { jobId } = await context.params;
    const job = await getUploadJob(jobId);
    if (job.ownerUserId !== user.id) return json({ error: { code: "NOT_FOUND", message: "Không thấy lượt tải lên." } }, 404);
    return json(job);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await requireUser(request);
    const { jobId } = await context.params;
    const action = new URL(request.url).searchParams.get("action");
    const job = action === "retry" ? await retryUpload(user.id, jobId) : await cancelUpload(user.id, jobId);
    return json(job);
  } catch (error) {
    return errorResponse(error);
  }
}
