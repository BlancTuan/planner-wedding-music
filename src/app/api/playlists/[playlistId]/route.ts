import { z } from "zod";
import { requireUser } from "@/server/auth";
import { errorResponse, json, parseBody, readJson } from "@/server/http";
import {
  addPlaylistItem,
  deletePlaylist,
  duplicatePlaylist,
  getPlaylist,
  orderPlaylist,
  removePlaylistItem,
  updatePlaylist,
} from "@/server/playlists";

export async function GET(request: Request, context: { params: Promise<{ playlistId: string }> }) {
  try {
    const user = await requireUser(request);
    const { playlistId } = await context.params;
    return json(await getPlaylist(user.id, playlistId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ playlistId: string }> }) {
  try {
    const user = await requireUser(request);
    const { playlistId } = await context.params;
    const body = parseBody(
      z.object({
        name: z.string().min(1).max(160).optional(),
        description: z.string().max(4000).nullable().optional(),
        archived: z.boolean().optional(),
        version: z.number().int(),
      }),
      await readJson(request),
    );
    return json(await updatePlaylist(user.id, playlistId, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ playlistId: string }> }) {
  try {
    const user = await requireUser(request);
    const { playlistId } = await context.params;
    await deletePlaylist(user.id, playlistId);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ playlistId: string }> }) {
  try {
    const user = await requireUser(request);
    const { playlistId } = await context.params;
    const body = parseBody(
      z.object({
        action: z.enum(["duplicate", "add-item", "remove-item", "order"]),
        revisionId: z.string().uuid().optional(),
        itemId: z.string().uuid().optional(),
        itemIds: z.array(z.string().uuid()).optional(),
        note: z.string().max(1000).nullable().optional(),
        version: z.number().int().optional(),
      }),
      await readJson(request),
    );
    if (body.action === "duplicate") return json(await duplicatePlaylist(user.id, playlistId), 201);
    if (body.action === "add-item" && body.revisionId && body.version) {
      return json(await addPlaylistItem(user.id, playlistId, body.revisionId, body.note ?? null, body.version), 201);
    }
    if (body.action === "remove-item" && body.itemId && body.version) {
      return json(await removePlaylistItem(user.id, playlistId, body.itemId, body.version));
    }
    if (body.action === "order" && body.itemIds && body.version) {
      return json(await orderPlaylist(user.id, playlistId, body.itemIds, body.version));
    }
    return json({ error: { code: "VALIDATION_ERROR", message: "Thiếu dữ liệu danh sách.", details: {} } }, 422);
  } catch (error) {
    return errorResponse(error);
  }
}
