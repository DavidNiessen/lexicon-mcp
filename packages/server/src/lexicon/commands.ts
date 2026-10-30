import { z } from "zod";
import { specification } from "./spec.js";

const integer = z.number().int();
const parameters: Record<string, z.ZodType> = {
  MusicPlayer_Load: z.object({ id: integer.positive() }).strict(),
  MusicPlayer_Seek: z.union([
    z.object({ progress: z.number().min(0).max(1) }).strict(),
    z.object({ seconds: z.number().nonnegative() }).strict(),
  ]),
  MusicPlayer_JumpBeats: z.object({ beats: integer }).strict(),
  MusicPlayer_JumpSeconds: z.object({ seconds: z.number() }).strict(),
  MusicPlayer_LoopCreate: z.object({ beats: integer.positive() }).strict(),
  Application_SetRating: z.object({ amount: integer.min(0).max(5) }).strict(),
  Application_SetColor: z
    .object({
      color: z
        .enum(
          specification.components.schemas.Color!.enum as [string, ...string[]],
        )
        .nullable(),
    })
    .strict(),
  TrackBrowser_FocusFilter: z
    .object({
      field: z.enum(
        specification.components.schemas["Track Fields"]!.enum as [
          string,
          ...string[],
        ],
      ),
    })
    .strict(),
  Direct2Cdj_LoadDeck: z.object({ deckNumber: integer.min(1).max(8) }).strict(),
  PluginRunActionByName: z
    .object({
      pluginName: z.string().min(1),
      pluginActionName: z.string().min(1),
    })
    .strict(),
  AudioAnalyzer_Analyze: z
    .object({
      trackIds: z.array(integer.positive()).min(1),
      analyzeKey: z.boolean().optional(),
      analyzeBeatgrid: z.boolean().optional(),
      analyzeWaveform: z.boolean().optional(),
      analyzeEnergy: z.boolean().optional(),
      doNotOverwrite: z.boolean().optional(),
      tempoRange: z
        .enum([
          "0_300",
          "58_115",
          "68_135",
          "78_155",
          "88_175",
          "98_195",
          "128_255",
          "180_300",
        ])
        .optional(),
    })
    .strict(),
};
for (const name of [
  "Hotcue",
  "CreateHotcue",
  "DeleteHotcue",
  "MoveHotcue",
  "ToggleMemoryCue",
  "ApplyCueTemplate",
  "AddAndApplyCueTemplate",
]) {
  parameters[`MusicPlayer_${name}`] = z
    .object({ index: integer.min(0).max(15) })
    .strict();
}
for (const name of ["Energy", "Danceability", "Popularity", "Happiness"])
  parameters[`Application_Set${name}`] = z
    .object({ amount: integer.min(0).max(10) })
    .strict();
for (const name of ["AddShortcut", "ToggleShortcut"])
  parameters[`Application_Tags_${name}`] = z
    .object({ amount: integer.min(1).max(20) })
    .strict();
for (const name of ["ShowPlaylist", "AddSelectedTracks"])
  parameters[`FavoritePlaylists_${name}`] = z
    .object({ amount: integer.min(1).max(20) })
    .strict();

const noOps = new Set([
  "MusicPlayer_TempomarkerMoveGridLeft",
  "MusicPlayer_TempomarkerMoveGridRight",
  "MusicPlayer_TempomarkerIncreaseBpm",
  "MusicPlayer_TempomarkerDecreaseBpm",
]);
export interface CommandDescriptor {
  name: string;
  classification: "direct" | "trigger" | "dialog" | "unsupported";
  risk: "low" | "bulk" | "destructive";
  prerequisites: string[];
  description: string;
  inputSchema: z.ZodType;
}

export const commands: CommandDescriptor[] = (
  specification.components.schemas["Control Actions"]!.enum as string[]
).map((name) => {
  const classification = noOps.has(name)
    ? "unsupported"
    : /Dialog|OpenSettings|OpenEditor|OpenTags|OpenSearch|OpenHotkeys/.test(
          name,
        )
      ? "dialog"
      : name === "AudioAnalyzer_Analyze" || name.startsWith("PluginRunAction")
        ? "trigger"
        : "direct";
  const risk =
    /Delete|Remove|Quit|Restore|UndoLast|Archive|PluginRunAction/.test(name)
      ? "destructive"
      : /Application_Set|Application_Tags|Analyze|Selected|Merge|Cleanup|Rewrite|Prefix|Capitalize|CloudFileBackup|Beatport_.*Cart/.test(
            name,
          )
        ? "bulk"
        : "low";
  const prerequisites = name.startsWith("Direct2Cdj")
    ? ["Connected Direct2CDJ player", "Appropriate selected or loaded track"]
    : /Selected|TrackBrowser_|Application_Set|Application_Tags/.test(name)
      ? ["Relevant tracks or playlist selected in Lexicon"]
      : name.startsWith("MusicPlayer_") && name !== "MusicPlayer_Load"
        ? ["Track loaded in Lexicon player"]
        : [];
  return {
    name,
    classification,
    risk,
    prerequisites,
    description:
      classification === "unsupported"
        ? "Accepted by Lexicon but has no effect through the API; available only as a hotkey."
        : classification === "dialog"
          ? "Opens an interactive Lexicon interface; user interaction is required."
          : "Dispatches a Lexicon command. Acceptance does not prove completion; unmet prerequisites may silently do nothing.",
    inputSchema: parameters[name] ?? z.object({}).strict(),
  };
});

export function listCommands(
  query = "",
): Omit<CommandDescriptor, "inputSchema">[] {
  return commands
    .filter((command) =>
      command.name.toLowerCase().includes(query.toLowerCase()),
    )
    .map(({ name, classification, risk, prerequisites, description }) => ({
      name,
      classification,
      risk,
      prerequisites,
      description,
    }));
}
export function getCommand(name: string): CommandDescriptor | undefined {
  return commands.find((command) => command.name === name);
}

export const commandSchema = z
  .object({
    action: z.enum(
      commands.map((command) => command.name) as [string, ...string[]],
    ),
    parameters: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const command = getCommand(input.action)!;
    if (command.classification === "unsupported")
      ctx.addIssue({
        code: "custom",
        message: "This action has no effect through the API",
      });
    const parsed = command.inputSchema.safeParse(input.parameters ?? {});
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        ctx.addIssue({
          code: "custom",
          path: ["parameters", ...issue.path],
          message: issue.message,
        });
  });
