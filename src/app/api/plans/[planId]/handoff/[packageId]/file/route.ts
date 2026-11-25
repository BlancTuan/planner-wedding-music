import { requireUser } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { readPackageFile } from "@/server/handoff";

export async function GET(request: Request, context: { params: Promise<{ planId: string; packageId: string }> }) {
  try {
    const user = await requireUser(request);
    const { planId, packageId } = await context.params;
    const bytes = await readPackageFile(user.id, planId, packageId);
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": "application/zip", "content-disposition": "attachment; filename=\"ban-giao.zip\"" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
