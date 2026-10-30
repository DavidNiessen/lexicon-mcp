# Tools, commands, and workflows

The MCP server advertises current schemas through tool discovery. Treat those schemas as the interface reference for the installed version. Tool names use the `lexicon_` prefix. Read results use explicit limits and offsets; request only fields needed for the task.

Successful tool responses expose a `result` value in structured content and the equivalent JSON text. Tool failures use MCP's error flag and a JSON error description. Available discovery resources are `lexicon://capabilities`, `lexicon://fields`, `lexicon://commands`, and `lexicon://reports/{id}`.

## Library API

The operation registry covers documented track, playlist, custom-tag, player, queue, and control endpoints. Field definitions and command documentation are also available as resources. Search supports Lexicon's typed filter syntax and respects incoming/archive source selection.

Track mutation updates library metadata. File-reference changes update the library's location field; they do not move audio files. Imported cue/beatgrid data that is not being changed must be preserved. Read the returned track to obtain the normalized stored location.

Playlist operations preserve original track order. Folder membership is aggregated by Lexicon; smartlist membership is evaluated by Lexicon. Membership editing applies to ordinary playlists rather than folders or smartlists. Smartlist rules must use operators compatible with the field type.

## Command discovery

Use `lexicon_list_commands` to find commands, then `lexicon_get_command` to inspect parameters, prerequisites, risk, and completion semantics. Invoke supported commands with `lexicon_run_command`.

Commands can depend on selection, the loaded player track, a configured template, or connected hardware. A successful dispatch is not proof of completion. Dialog-opening commands require the user to finish the operation inside Lexicon. Known hotkey-only commands are classified as unsupported rather than reported as successful API work.

## Workflows

| Workflow                           | Result                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Library health                     | Counts and findings for metadata, files, cues, grids, tags, and playlists.               |
| Duplicate candidates               | Explained candidates based on existing fingerprints or normalized metadata and duration. |
| Metadata cleanup                   | Explicit before/after edit proposals; no inferred genre or artist corrections.           |
| Playlist comparison                | Membership differences and shared tracks.                                                |
| Playlist merge/deduplication/order | An ordered proposal that can enter the change-plan system.                               |
| Set preparation                    | Ranked existing tracks with BPM/key/energy/duration/tag reasoning.                       |

Duplicate candidates are evidence for review, not an automatic deletion decision. Key compatibility and metadata ranking do not analyze the audio. Large workflows use jobs: start a job, inspect status, retrieve paginated results, or cancel it. An interrupted job is not silently restarted.

Reports may be exported to JSON or CSV only on explicit request and within the configured export directory. CSV export escapes spreadsheet formula prefixes. Reports can contain private library metadata.

Playlist copying uses two reviewed plans: create the destination, then populate its returned ID. The intermediate playlist is empty. Copies of folders or smartlists materialize their current tracks into an ordinary playlist. JSON exports preserve the full report; CSV exports use its primary findings, candidates, tracks, operations, or memberships collection.

Common command shortcuts are `lexicon_player_load`, `lexicon_player_play`, `lexicon_player_pause`, `lexicon_player_seek`, and `lexicon_analyze_tracks`. They use the same validation and review policy as `lexicon_run_command`.

## Visual previews

MCP UI-capable hosts can display change-plan previews, library-health findings, and prepared-set results alongside tool responses. The UI is read-only and is designed for inspecting the exact proposal or report, including empty and partial-result states. It does not apply edits or grant approval. Ask the assistant to create or inspect a reviewed plan, and confirm in chat before using the separate apply tool.

Hosts without MCP UI/MCP Apps support continue receiving text and structured JSON. Agent installation configures MCP access; it does not guarantee that agent's current version renders previews. Large results remain paginated, and previews identify bounded or truncated views rather than claiming to show the whole library.

## Review prompts

Reusable prompts support library audits, metadata cleanup, and set preparation. A suitable first request is: “Audit my library and show a summary without making changes.” For edits: “Propose the exact changes, wait for my confirmation, then apply the approved plan.”
