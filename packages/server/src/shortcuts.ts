import { getCommand } from "./lexicon/index.js";

const aliases = {
  lexicon_player_load: "MusicPlayer_Load",
  lexicon_player_play: "MusicPlayer_Play",
  lexicon_player_pause: "MusicPlayer_Pause",
  lexicon_player_seek: "MusicPlayer_Seek",
  lexicon_analyze_tracks: "AudioAnalyzer_Analyze",
} as const;

export const shortcuts = Object.entries(aliases).map(([name, action]) => {
  const command = getCommand(action)!;
  return {
    name,
    action,
    inputSchema: command.inputSchema,
    mutating: true,
    description: `${action}: ${command.description} ${command.risk === "low" ? "" : "Returns a change preview requiring user confirmation."}`,
  };
});
