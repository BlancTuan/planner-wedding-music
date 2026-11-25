import { previewAssetForTrack } from "@/server/catalog";
import { errorResponse } from "@/server/http";
import { readStorage } from "@/server/storage";

export async function GET(_request: Request, context: { params: Promise<{ trackId: string }> }) {
  try {
    const { trackId } = await context.params;
    const asset = await previewAssetForTrack(trackId);
    const bytes = await readStorage(asset.storageKey);
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": asset.mediaFormat === "MP3" ? "audio/mpeg" : "audio/wav" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
