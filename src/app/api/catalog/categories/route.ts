import { listCategories } from "@/server/catalog";
import { errorResponse, json } from "@/server/http";

export async function GET() {
  try {
    return json({ items: await listCategories() });
  } catch (error) {
    return errorResponse(error);
  }
}
