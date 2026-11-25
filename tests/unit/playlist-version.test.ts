import { describe, expect, it } from "vitest";
import { versionsConflict } from "@/server/concurrency";
import { removePlaylistItem } from "@/server/playlists/items";

describe("playlist versions", () => {
  it("rejects a stale version and keeps item removal from deleting the source", () => {
    expect(versionsConflict(4, 3)).toBe(true);
    expect(versionsConflict(4, 4)).toBe(false);
    const result = removePlaylistItem(
      {
        items: [
          { id: "item-1", revisionId: "rev-1" },
          { id: "item-2", revisionId: "rev-1" },
        ],
        assets: [{ id: "asset-1" }],
      },
      "item-1",
    );
    expect(result.items.map((item) => item.id)).toEqual(["item-2"]);
    expect(result.assets).toEqual([{ id: "asset-1" }]);
  });
});
