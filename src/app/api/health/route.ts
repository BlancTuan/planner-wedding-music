import { one } from "@/server/db";
import { errorResponse, json } from "@/server/http";

export async function GET() {
  try {
    await one("SELECT 1 AS ok");
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
