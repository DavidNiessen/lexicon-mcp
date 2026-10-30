import {
  normalizeText,
  numberOf,
  trackPages,
  type LibraryClient,
  type WorkflowContext,
} from "./types.js";

const minor = [
  "Abm",
  "Ebm",
  "Bbm",
  "Fm",
  "Cm",
  "Gm",
  "Dm",
  "Am",
  "Em",
  "Bm",
  "F#m",
  "C#m",
];
const major = ["B", "F#", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];
const enharmonic: Record<string, string> = {
  "G#m": "Abm",
  "D#m": "Ebm",
  "A#m": "Bbm",
  Gb: "F#",
  "C#": "Db",
  "G#": "Ab",
  "D#": "Eb",
  "A#": "Bb",
};

export function camelotKey(
  value: unknown,
): { number: number; mode: string } | undefined {
  const text = normalizeText(value);
  const direct = /^(1[0-2]|[1-9])([ab])$/i.exec(text);
  if (direct)
    return { number: Number(direct[1]), mode: direct[2]!.toUpperCase() };
  const note = enharmonic[text] ?? text;
  const a = minor.indexOf(note);
  if (a >= 0) return { number: a + 1, mode: "A" };
  const b = major.indexOf(note);
  if (b >= 0) return { number: b + 1, mode: "B" };
  return undefined;
}

export function keysCompatible(a: unknown, b: unknown): boolean {
  const left = camelotKey(a);
  const right = camelotKey(b);
  if (!left || !right) return false;
  return (
    left.number === right.number ||
    (left.mode === right.mode &&
      [1, 11].includes(Math.abs(left.number - right.number)))
  );
}

export async function prepareSet(
  client: LibraryClient,
  input: Record<string, unknown>,
  context: WorkflowContext,
) {
  const limit = Number(input.limit ?? 30);
  const excluded = new Set((input.excludeIds as number[]) ?? []);
  const tags = (input.tagIds as number[]) ?? [];
  const ranked: {
    id: number;
    title: string;
    artist: string;
    bpm?: number;
    key: string;
    duration: number;
    score: number;
    reasons: string[];
  }[] = [];
  let scanned = 0;
  for await (const tracks of trackPages(
    client,
    {
      source: input.source,
      fields: [
        "id",
        "title",
        "artist",
        "bpm",
        "key",
        "energy",
        "duration",
        "tags",
      ],
    },
    context,
  )) {
    for (const track of tracks) {
      scanned++;
      if (excluded.has(track.id)) continue;
      if (
        !tags.every(
          (id) => Array.isArray(track.tags) && track.tags.includes(id),
        )
      )
        continue;
      const duration = numberOf(track.duration);
      if (!duration || duration <= 0) continue;
      const bpm = numberOf(track.bpm);
      const reasons: string[] = [];
      let score = 0;
      if (typeof input.bpm === "number") {
        if (
          bpm === undefined ||
          Math.abs(bpm - input.bpm) > Number(input.bpmTolerance ?? 10)
        )
          continue;
        const distance = Math.abs(bpm - input.bpm);
        score += 50 / (1 + distance);
        reasons.push(`BPM distance ${distance.toFixed(1)}`);
      }
      if (input.key) {
        if (keysCompatible(track.key, input.key)) {
          score += 30;
          reasons.push("Harmonically compatible with target key");
        } else reasons.push("Key differs from target or is unknown");
      }
      if (
        typeof input.energy === "number" &&
        numberOf(track.energy) !== undefined
      ) {
        const distance = Math.abs(Number(track.energy) - input.energy);
        score += 20 / (1 + distance);
        reasons.push(`Energy distance ${distance}`);
      }
      if (tags.length) reasons.push("Contains all requested tags");
      ranked.push({
        id: track.id,
        title: normalizeText(track.title),
        artist: normalizeText(track.artist),
        bpm,
        key: normalizeText(track.key),
        duration,
        score,
        reasons,
      });
      ranked.sort((a, b) => b.score - a.score || a.id - b.id);
      // Keep only bounded candidates; final sequence is ordered by tempo then ID.
      if (ranked.length > limit * 4) ranked.pop();
    }
  }
  const selected: typeof ranked = [];
  let duration = 0;
  const maximumSeconds = Number(input.durationMinutes ?? 60) * 60;
  for (const track of ranked) {
    if (selected.length >= limit) break;
    if (duration + track.duration > maximumSeconds) continue;
    duration += track.duration;
    selected.push(track);
  }
  selected.sort(
    (a, b) => (a.bpm ?? 0) - (b.bpm ?? 0) || b.score - a.score || a.id - b.id,
  );
  return {
    scanned,
    durationSeconds: duration,
    requestedDurationSeconds: maximumSeconds,
    tracks: selected,
    trackIds: selected.map((track) => track.id),
    ordering:
      "Ascending BPM, then target-match score; durations use full tracks without overlap estimates.",
  };
}
