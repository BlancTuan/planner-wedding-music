export type PlaylistState = {
  items: Array<{ id: string; revisionId: string }>;
  assets: Array<{ id: string }>;
};

export function removePlaylistItem(state: PlaylistState, itemId: string): PlaylistState {
  return {
    items: state.items.filter((item) => item.id !== itemId),
    assets: state.assets.map((asset) => ({ ...asset })),
  };
}
