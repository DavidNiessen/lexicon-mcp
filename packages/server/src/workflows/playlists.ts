import {
  abortIfNeeded,
  dataOf,
  type LibraryClient,
  type ProposedOperation,
  type WorkflowContext,
} from "./types.js";

export async function playlistWorkflow(
  client: LibraryClient,
  input: Record<string, unknown>,
  context: WorkflowContext,
) {
  const ids = [...new Set(input.playlistIds as number[])];
  const playlists: {
    id: number;
    name: string;
    type: string;
    trackIds: number[];
  }[] = [];
  for (const id of ids) {
    abortIfNeeded(context);
    const data = dataOf(await client.request("GET", "/playlist", { id }));
    const playlist = data.playlist as {
      id: number;
      name: string;
      type: string;
      trackIds: number[];
    };
    if (!playlist || !Array.isArray(playlist.trackIds))
      throw new Error(`Invalid playlist ${id}`);
    playlists.push(playlist);
  }
  const combined = [
    ...new Set(playlists.flatMap((playlist) => playlist.trackIds)),
  ];
  if (input.action === "compare") {
    const memberships = combined.map((trackId) => ({
      trackId,
      playlistIds: playlists
        .filter((playlist) => playlist.trackIds.includes(trackId))
        .map((playlist) => playlist.id),
    }));
    return {
      playlists: playlists.map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        count: playlist.trackIds.length,
      })),
      commonTrackIds: memberships
        .filter((item) => item.playlistIds.length === playlists.length)
        .map((item) => item.trackId),
      memberships,
    };
  }
  if (input.action === "copy") {
    if (!input.name)
      throw new Error("A name is required when copying a playlist");
    if (playlists.length !== 1)
      throw new Error("Copy requires exactly one source playlist");
    return {
      operations: [
        {
          tool: "lexicon_create_playlist",
          input: { name: input.name, type: "2" },
        },
      ],
      followUp: {
        action: "populate_created_playlist",
        trackIds: playlists[0]!.trackIds,
      },
      note: "Review creation first. Use the returned playlist ID to plan adding these track IDs; creation IDs do not exist yet.",
    };
  }
  const targetId = Number(input.targetId ?? ids[0]);
  let target = playlists.find((playlist) => playlist.id === targetId);
  if (!target) {
    const data = dataOf(
      await client.request("GET", "/playlist", { id: targetId }),
    );
    target = data.playlist as typeof target;
  }
  if (!target || String(target.type) !== "2")
    throw new Error(
      "Target must be a normal playlist, not a folder or smartlist",
    );
  const operations: ProposedOperation[] = [];
  if (input.action === "merge") {
    const existing = new Set(target.trackIds);
    const additions = combined.filter((id) => !existing.has(id));
    if (additions.length)
      operations.push({
        tool: "lexicon_add_playlist_tracks",
        input: { id: targetId, trackIds: additions },
      });
  } else {
    const desired =
      input.action === "deduplicate"
        ? [...new Set(target.trackIds)]
        : (input.trackIds as number[]);
    if (!desired) throw new Error("Explicit trackIds are required for reorder");
    if (input.action === "reorder") {
      const before = [...target.trackIds].sort((a, b) => a - b);
      const after = [...desired].sort((a, b) => a - b);
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw new Error(
          "Reorder must contain exactly the existing playlist membership, including duplicates",
        );
    }
    if (JSON.stringify(desired) !== JSON.stringify(target.trackIds)) {
      if (target.trackIds.length)
        operations.push({
          tool: "lexicon_remove_playlist_tracks",
          input: { id: targetId, trackIds: [...new Set(target.trackIds)] },
        });
      if (desired.length)
        operations.push({
          tool: "lexicon_add_playlist_tracks",
          input: { id: targetId, trackIds: desired, index: 0 },
        });
    }
  }
  return {
    targetId,
    operations,
    originalTrackIds: target.trackIds,
    note: "Proposal only; playlist replacement is a multi-step operation and can partially fail.",
  };
}
