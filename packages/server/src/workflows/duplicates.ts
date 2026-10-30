import {
  normalizeText,
  normalizedIdentity,
  numberOf,
  trackPages,
  type LibraryClient,
  type Track,
  type WorkflowContext,
} from "./types.js";

interface Candidate {
  trackIds: number[];
  confidence: "high" | "medium";
  reason: string;
}

export async function findDuplicates(
  client: LibraryClient,
  input: Record<string, unknown>,
  context: WorkflowContext,
) {
  const fingerprints = new Map<string, number[]>();
  const metadata = new Map<string, Track[]>();
  let scanned = 0;
  const maximumIndexedTracks = 100_000;
  let truncated = false;
  outer: for await (const tracks of trackPages(
    client,
    {
      source: input.source,
      fields: ["id", "fingerprint", "artist", "title", "duration"],
    },
    context,
  )) {
    for (const track of tracks) {
      if (scanned >= maximumIndexedTracks) {
        truncated = true;
        break outer;
      }
      scanned++;
      const fingerprint = normalizeText(track.fingerprint);
      if (fingerprint) {
        const group = fingerprints.get(fingerprint) ?? [];
        group.push(track.id);
        fingerprints.set(fingerprint, group);
      }
      const title = normalizedIdentity(track.title);
      const artist = normalizedIdentity(track.artist);
      if (title && artist && numberOf(track.duration) !== undefined) {
        const identity = JSON.stringify([artist, title]);
        const group = metadata.get(identity) ?? [];
        group.push(track);
        metadata.set(identity, group);
      }
    }
  }
  const offset = Number(input.offset ?? 0);
  const limit = Number(input.limit ?? 100);
  const candidates: Candidate[] = [];
  let total = 0;
  const exactGroups = new Map<number, number>();
  const add = (candidate: Candidate) => {
    if (total >= offset && candidates.length < limit)
      candidates.push(candidate);
    total++;
  };
  let fingerprintGroupId = 0;
  for (const group of fingerprints.values()) {
    if (group.length < 2) continue;
    for (const id of group) exactGroups.set(id, fingerprintGroupId);
    fingerprintGroupId++;
    add({
      trackIds: group,
      confidence: "high",
      reason:
        "Identical existing Lexicon fingerprints; verify versions before removal.",
    });
  }
  const tolerance = Number(input.durationTolerance ?? 2);
  for (const group of metadata.values()) {
    group.sort((a, b) => Number(a.duration) - Number(b.duration));
    let cluster: Track[] = [];
    const emit = () => {
      if (
        cluster.length > 1 &&
        !cluster.every(
          (track) =>
            exactGroups.get(track.id) !== undefined &&
            exactGroups.get(track.id) === exactGroups.get(cluster[0]!.id),
        )
      ) {
        add({
          trackIds: cluster.map((track) => track.id),
          confidence: "medium",
          reason: `Same normalized artist/title and duration within ${tolerance} seconds; audio was not compared.`,
        });
      }
    };
    for (const track of group) {
      if (
        cluster.length &&
        Number(track.duration) - Number(cluster[0]!.duration) > tolerance
      ) {
        emit();
        cluster = [];
      }
      cluster.push(track);
    }
    emit();
  }
  return {
    scanned,
    total,
    offset,
    limit,
    candidates,
    truncated,
    maximumIndexedTracks,
    warning: truncated
      ? "Index limit reached; narrow the source or process a smaller library."
      : undefined,
  };
}
