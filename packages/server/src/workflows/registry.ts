import { z } from "zod";

const source = z
  .enum(["all", "non-archived", "archived", "incoming"])
  .default("non-archived");
const trackIds = z.array(z.number().int().positive()).min(1).max(10000);
const bounded = {
  source,
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(1000).default(100),
};

export const workflowRegistry = [
  {
    name: "lexicon_library_health",
    description:
      "Inspect missing metadata, files, cues, grids, invalid tag assignments, and playlist statistics. Pages findings; performs no writes.",
    inputSchema: z.object({
      ...bounded,
      checkFiles: z.boolean().default(false),
      requiredFields: z
        .array(z.enum(["title", "artist", "genre", "key", "bpm"]))
        .default(["title", "artist", "genre", "key", "bpm"]),
    }),
  },
  {
    name: "lexicon_find_duplicates",
    description:
      "Find candidate duplicate groups using existing fingerprints or matching normalized artist/title and similar duration. Does not delete tracks.",
    inputSchema: z.object({
      ...bounded,
      durationTolerance: z.number().min(0).max(30).default(2),
    }),
  },
  {
    name: "lexicon_cleanup_metadata",
    description:
      "Propose whitespace and explicit case/alias cleanup for specified tracks. Returns operations for change-plan review; does not write.",
    inputSchema: z.object({
      trackIds,
      fields: z
        .array(
          z.enum([
            "title",
            "artist",
            "albumTitle",
            "genre",
            "label",
            "remixer",
            "comment",
            "grouping",
          ]),
        )
        .min(1)
        .default(["title", "artist", "genre"]),
      capitalization: z
        .enum(["preserve", "lower", "upper", "title"])
        .default("preserve"),
      aliases: z.record(z.string(), z.string()).default({}),
    }),
  },
  {
    name: "lexicon_playlist_workflow",
    description:
      "Compare playlists or propose copy, merge, deduplicate, and explicit reordering operations. Returns a reviewable proposal, never mutates directly.",
    inputSchema: z.object({
      action: z.enum(["compare", "copy", "merge", "deduplicate", "reorder"]),
      playlistIds: z.array(z.number().int().positive()).min(1).max(100),
      targetId: z.number().int().positive().optional(),
      name: z.string().min(1).max(200).optional(),
      trackIds: z.array(z.number().int().positive()).max(10000).optional(),
    }),
  },
  {
    name: "lexicon_prepare_set",
    description:
      "Rank existing tracks and propose an explained set order using tempo, harmonic compatibility, energy, duration, and required tag IDs. No writes.",
    inputSchema: z.object({
      source,
      bpm: z.number().positive().optional(),
      bpmTolerance: z.number().min(0).max(100).default(10),
      key: z.string().optional(),
      energy: z.number().min(0).max(10).optional(),
      durationMinutes: z.number().positive().max(1440).default(60),
      tagIds: z.array(z.number().int().positive()).default([]),
      limit: z.number().int().min(1).max(200).default(30),
      excludeIds: z.array(z.number().int().positive()).default([]),
    }),
  },
] as const;

export type WorkflowName = (typeof workflowRegistry)[number]["name"];
