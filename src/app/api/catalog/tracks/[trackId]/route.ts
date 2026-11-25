import { getPublishedTrack } from "@/server/catalog";
import { errorResponse, json } from "@/server/http";

export async function GET(_request: Request, context: { params: Promise<{ trackId: string }> }) {
  try {
    const { trackId } = await context.params;
    return json(await getPublishedTrack(trackId));
  } catch (error) {
    return errorResponse(error);
  }
}
