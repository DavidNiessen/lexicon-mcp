import { access } from "node:fs/promises";
import {
  abortIfNeeded,
  dataOf,
  trackPages,
  type LibraryClient,
  type WorkflowContext,
} from "./types.js";

interface Finding {
  trackId: number;
  issue: string;
  fields?: string[];
}

export async function libraryHealth(
  client: LibraryClient,
  input: Record<string, unknown>,
  context: WorkflowContext,
) {
  const offset = Number(input.offset ?? 0);
  const limit = Number(input.limit ?? 100);
  const findings: Finding[] = [];
  let totalFindings = 0;
  let scanned = 0;
  const counts: Record<string, number> = {};
  const tags = dataOf(await client.request("GET", "/tags"));
  const rawTags = tags.tags ?? tags.customTags ?? [];
  const validTags = new Set(
    Array.isArray(rawTags) ? rawTags.map((tag: { id: number }) => tag.id) : [],
  );
  const add = (finding: Finding) => {
    counts[finding.issue] = (counts[finding.issue] ?? 0) + 1;
    if (totalFindings >= offset && findings.length < limit)
      findings.push(finding);
    totalFindings++;
  };
  for await (const tracks of trackPages(
    client,
    {
      source: input.source,
      fields: [
        "id",
        "title",
        "artist",
        "genre",
        "key",
        "bpm",
        "location",
        "streamingService",
        "cuepoints",
        "tempomarkers",
        "tags",
      ],
    },
    context,
  )) {
    for (const track of tracks) {
      abortIfNeeded(context);
      scanned++;
      const missing = (
        (input.requiredFields as string[]) ?? [
          "title",
          "artist",
          "genre",
          "key",
          "bpm",
        ]
      ).filter(
        (field) =>
          track[field] === undefined ||
          track[field] === null ||
          track[field] === "" ||
          (field === "bpm" && track[field] === 0),
      );
      if (missing.length)
        add({ trackId: track.id, issue: "missing_metadata", fields: missing });
      if (!Array.isArray(track.cuepoints) || track.cuepoints.length === 0)
        add({ trackId: track.id, issue: "missing_cues" });
      if (!Array.isArray(track.tempomarkers) || track.tempomarkers.length === 0)
        add({ trackId: track.id, issue: "missing_beatgrid" });
      if (
        Array.isArray(track.tags) &&
        track.tags.some((id) => !validTags.has(id))
      )
        add({ trackId: track.id, issue: "unknown_tag_assignment" });
      if (
        input.checkFiles &&
        !track.streamingService &&
        typeof track.location === "string"
      ) {
        try {
          await access(track.location);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          add({
            trackId: track.id,
            issue:
              code === "ENOENT" || code === "ENOTDIR"
                ? "missing_file"
                : "file_unreadable",
          });
        }
      }
    }
  }
  const playlists = dataOf(await client.request("GET", "/playlists"));
  let playlistCount = 0;
  let folderCount = 0;
  let smartlistCount = 0;
  const visit = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (String(node.type) === "1") folderCount++;
      else if (String(node.type) === "3") smartlistCount++;
      else playlistCount++;
      visit(node.children ?? node.playlists);
    }
  };
  visit(playlists.playlists);
  return {
    scanned,
    counts,
    playlistStats: {
      playlists: playlistCount,
      folders: folderCount,
      smartlists: smartlistCount,
    },
    total: totalFindings,
    offset,
    limit,
    findings,
    fileChecksPerformed: Boolean(input.checkFiles),
    consistency: "Live paginated view; concurrent changes may affect counts.",
  };
}
