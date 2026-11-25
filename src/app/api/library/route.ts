import { requireUser } from "@/server/auth";
import { errorResponse, json } from "@/server/http";
import { listLibrary } from "@/server/media/assets";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const url = new URL(request.url);
    const items = await listLibrary(
      user.id,
      url.searchParams.get("q") ?? "",
      url.searchParams.get("sourceType") ?? "",
      url.searchParams.get("status") ?? "",
    );
    return json({ items });
  } catch (error) {
    return errorResponse(error);
  }
}
