import { requireUser } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { getOwnedAsset } from "@/server/media/assets";
import { readStorage } from "@/server/storage";

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  try {
    const user = await requireUser(request);
    const { assetId } = await context.params;
    const asset = await getOwnedAsset(user.id, assetId);
    const bytes = await readStorage(asset.storageKey);
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": asset.mediaFormat === "MP3" ? "audio/mpeg" : "audio/wav" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
