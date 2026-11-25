import { requireUser } from "@/server/auth";
import { errorResponse, json } from "@/server/http";
import { cancelExport } from "@/server/media/assets";

export async function POST(request: Request, context: { params: Promise<{ exportId: string }> }) {
  try {
    const user = await requireUser(request);
    const { exportId } = await context.params;
    return json(await cancelExport(user.id, exportId));
  } catch (error) {
    return errorResponse(error);
  }
}
