import { z } from "zod";
import { requireUser } from "@/server/auth";
import { errorResponse, json, parseBody, readJson } from "@/server/http";
import { createPlaylist, listPlaylists } from "@/server/playlists";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return json({ items: await listPlaylists(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = parseBody(
      z.object({ name: z.string().min(1).max(160), description: z.string().max(4000).nullable().optional() }),
      await readJson(request),
    );
    return json(await createPlaylist(user.id, body.name, body.description ?? null), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
