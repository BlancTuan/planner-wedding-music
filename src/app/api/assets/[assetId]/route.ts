import { requireUser } from "@/server/auth";
import { errorResponse, json } from "@/server/http";
import { deleteAsset, getOwnedAsset } from "@/server/media/assets";

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  try {
    const user = await requireUser(request);
    const { assetId } = await context.params;
    return json(await getOwnedAsset(user.id, assetId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ assetId: string }> }) {
  try {
    const user = await requireUser(request);
    const { assetId } = await context.params;
    await deleteAsset(user.id, assetId);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
