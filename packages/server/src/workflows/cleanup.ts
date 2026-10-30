import {
  abortIfNeeded,
  dataOf,
  normalizeText,
  type LibraryClient,
  type ProposedOperation,
  type Track,
  type WorkflowContext,
} from "./types.js";

export async function readTracks(
  client: LibraryClient,
  ids: number[],
  context: WorkflowContext,
): Promise<Track[]> {
  const tracks: Track[] = [];
  const unique = [...new Set(ids)];
  for (let index = 0; index < unique.length; index += 200) {
    abortIfNeeded(context);
    const data = dataOf(
      await client.request("GET", "/search/tracks", {
        filter: { id: unique.slice(index, index + 200).join(",") },
        limit: 1000,
        offset: 0,
        source: "all",
      }),
    );
    if (!Array.isArray(data.tracks))
      throw new Error("Lexicon search response has no tracks");
    tracks.push(...(data.tracks as Track[]));
  }
  const found = new Set(tracks.map((track) => track.id));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length)
    throw new Error(`Tracks not found: ${missing.join(", ")}`);
  return tracks;
}

export async function cleanupMetadata(
  client: LibraryClient,
  input: Record<string, unknown>,
  context: WorkflowContext,
) {
  const tracks = await readTracks(client, input.trackIds as number[], context);
  const operations: ProposedOperation[] = [];
  const aliases = (input.aliases as Record<string, string>) ?? {};
  for (const track of tracks) {
    const edits: Record<string, unknown> = {};
    for (const field of (input.fields as string[]) ?? [
      "title",
      "artist",
      "genre",
    ]) {
      if (typeof track[field] !== "string") continue;
      let result = normalizeText(track[field]);
      if (input.capitalization === "lower")
        result = result.toLocaleLowerCase("en");
      if (input.capitalization === "upper")
        result = result.toLocaleUpperCase("en");
      if (input.capitalization === "title")
        result = result
          .toLocaleLowerCase("en")
          .replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("en"));
      if (Object.hasOwn(aliases, result)) result = aliases[result]!;
      if (result !== track[field]) edits[field] = result;
    }
    if (Object.keys(edits).length)
      operations.push({
        tool: "lexicon_update_track",
        input: { id: track.id, edits },
      });
  }
  return {
    inspected: tracks.length,
    changed: operations.length,
    operations,
    note: "Proposal only. Create a change plan and review its before/after values before applying.",
  };
}
