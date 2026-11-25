import { requireUser } from "@/server/auth";
import { errorResponse, json } from "@/server/http";
import { waveformForAsset } from "@/server/media/assets";

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  try {
    const user = await requireUser(request);
    const { assetId } = await context.params;
    return json(await waveformForAsset(user.id, assetId));
  } catch (error) {
    return errorResponse(error);
  }
}
