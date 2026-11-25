import { requireUser } from "@/server/auth";
import { errorResponse, json } from "@/server/http";
import { deleteRevision, getRevision } from "@/server/media/assets";

export async function GET(request: Request, context: { params: Promise<{ revisionId: string }> }) {
  try {
    const user = await requireUser(request);
    const { revisionId } = await context.params;
    return json(await getRevision(user.id, revisionId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ revisionId: string }> }) {
  try {
    const user = await requireUser(request);
    const { revisionId } = await context.params;
    await deleteRevision(user.id, revisionId);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
