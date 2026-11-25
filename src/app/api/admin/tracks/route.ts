import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { createCatalogTrack, listAdminTracks, replaceCatalogMedia, setPublishState } from "@/server/admin-catalog";
import { errorResponse, json, parseBody, readJson } from "@/server/http";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return json({ items: await listAdminTracks() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const trackId = String(form.get("trackId") ?? "");
      if (!(file instanceof File) || !trackId) {
        return json({ error: { code: "VALIDATION_ERROR", message: "Thiếu tệp danh mục.", details: {} } }, 422);
      }
      return json(await replaceCatalogMedia(admin.id, trackId, file.name, Buffer.from(await file.arrayBuffer())), 201);
    }
    const body = parseBody(
      z.object({
        action: z.enum(["create", "publish", "unpublish"]).optional(),
        title: z.string().min(1).max(300).optional(),
        artistName: z.string().min(1).max(200).optional(),
        vocalType: z.enum(["VOCAL", "INSTRUMENTAL", "MIXED"]).optional(),
        usagePermission: z.enum(["PREVIEW_ALLOWED", "METADATA_ONLY", "RESTRICTED"]).optional(),
        sourceNote: z.string().trim().max(2000).nullish(),
        styleId: z.string().uuid().optional(),
        moodId: z.string().uuid().optional(),
        languageId: z.string().uuid().optional(),
        stageIds: z.array(z.string().uuid()).max(20).optional(),
        trackId: z.string().uuid().optional(),
        version: z.number().int().optional(),
      }),
      await readJson(request),
    );
    if (body.action === "publish" || body.action === "unpublish") {
      return json(await setPublishState(admin.id, body.trackId ?? "", body.action === "publish", body.version ?? 0));
    }
    return json(
      await createCatalogTrack(admin.id, {
        title: body.title ?? "",
        artistName: body.artistName ?? "",
        vocalType: body.vocalType ?? "INSTRUMENTAL",
        usagePermission: body.usagePermission ?? "METADATA_ONLY",
        sourceNote: body.sourceNote,
        styleId: body.styleId,
        moodId: body.moodId,
        languageId: body.languageId,
        stageIds: body.stageIds,
      }),
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
