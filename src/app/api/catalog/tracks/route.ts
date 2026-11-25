import { searchCatalog } from "@/server/catalog";
import { errorResponse, json } from "@/server/http";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await searchCatalog({
      q: url.searchParams.get("q") ?? "",
      stage: url.searchParams.get("stage") ?? "",
      mood: url.searchParams.get("mood") ?? "",
      style: url.searchParams.get("style") ?? "",
      language: url.searchParams.get("language") ?? "",
      vocalType: url.searchParams.get("vocalType") ?? "",
      sortBy: url.searchParams.get("sortBy") ?? "title",
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 20),
    });
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
