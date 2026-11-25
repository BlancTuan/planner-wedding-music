import { requireUser } from "@/server/auth";
import { errorResponse, json } from "@/server/http";
import { storageUsage } from "@/server/media/assets";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return json(await storageUsage(user.id));
  } catch (error) {
    return errorResponse(error);
  }
}
