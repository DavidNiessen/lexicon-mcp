import type { LexiconClient } from "./client.js";

type Marker = Record<string, unknown>;
/** Preserve proprietary DJ-app provenance when editing an existing cue or grid marker. */
export async function preserveImportedData(
  client: LexiconClient,
  input: Record<string, any>,
) {
  if (!input.edits?.cuepoints && !input.edits?.tempomarkers) return input;
  const result = await client.request<{ track: Record<string, unknown> }>(
    "GET",
    "/track",
    { id: input.id },
  );
  const edits = { ...input.edits };
  for (const field of ["cuepoints", "tempomarkers"]) {
    if (!Array.isArray(edits[field])) continue;
    const existing = result.track[field] as Marker[] | undefined;
    edits[field] = edits[field].map((marker: Marker) => {
      if (Object.hasOwn(marker, "data")) return marker;
      const key =
        marker.id !== undefined
          ? "id"
          : field === "cuepoints"
            ? "position"
            : "startTime";
      const previous = existing?.find(
        (candidate) => candidate[key] === marker[key],
      );
      return previous && Object.hasOwn(previous, "data")
        ? { ...marker, data: previous.data }
        : marker;
    });
  }
  return { ...input, edits };
}
