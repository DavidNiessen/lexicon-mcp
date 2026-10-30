# Compatibility and verification

This project remains a release candidate until required host and disposable-library checks are recorded. The table distinguishes implemented support from live verification.

| Target                             | Evidence/status                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Lexicon Beta 1.11.113 on Windows   | Five read-only API smoke checks passed on 2026-10-30; live mutations remain unverified.                                                     |
| Other Lexicon stable/beta releases | Not claimed without testing.                                                                                                                |
| Node distribution                  | Requires Node.js 24; one platform-neutral tarball runs the bundled program.                                                                 |
| Windows/macOS/Linux                | Adapter, protocol, and installer tests run in the CI matrix. Linux is a development/test target, not a Lexicon desktop compatibility claim. |
| Installer                          | Native configuration adapters are tested against isolated fixtures. Actual agent/version interoperability should be recorded separately.    |
| MCP UI                             | Compatible hosts can render previews; host support varies. Text/JSON responses remain available.                                            |
| MCP protocol                       | Current and legacy SDK client integration tests cover tool discovery/calls, resources, and prompts.                                         |

The checked-in API specification is the capability contract. Its generic version does not identify all application capabilities. Unsupported commands are reported explicitly; library mutations are never probed just to discover support.

## Package verification

`pnpm package` runs the emitted tarball through npm exec with an isolated cache and project. Version/help and an installer project dry run must pass without creating agent configuration or runtime files. Cross-platform tests must preserve unrelated agent settings, reject malformed configurations, handle paths safely, and keep dry runs non-mutating.

Visual preview checks cover escaped metadata, empty/error states, and fallback behavior. A selectable agent is not automatically claimed to render MCP UI.

Claude's documented transparent theming is covered by Chrome tests with two nested host frames, explicit light/dark host schemes, opposite system preferences, and `light-dark()` style tokens. Tests reproduce the former white canvas despite transparent computed CSS, then verify that the corrected rendered pixels match the host background. This is browser-level evidence rather than a live Claude account interaction. See [Claude's theming contract](https://claude.com/docs/connectors/building/mcp-apps/transparent-theming).

For every client, `lexicon_ui_status` reports the capabilities advertised by its current connection. Preview widgets are read-only. Automatic review uses native forms when advertised and chat review otherwise. When a user reports missing/broken native controls or asks for chat approval, the assistant can deliberately request `approval: "chat"`, then ask for explicit approval of the exact plan. Advertising forms does not remove the requirement for a prior chat-specific review marker. Protocol tests use synthetic consent and data; actual host rendering still needs verification. The server cannot independently inspect the chat transcript.

## Safe live smoke test

With Lexicon running, execute `node scripts/live-smoke.mjs`. It issues only GET requests for a single track, playlists, tags, playing state, and queue, and withholds library contents. It does not test writes or command dispatch.

The original read-only checks passed on 2026-10-30. Historical native-executable packaging evidence does not establish support for the current selected-agent installation path.

## Release acceptance record

Before a stable release, record the commit, CI run, package checksum, exact OS/Node/Lexicon and agent versions, installer result, preview rendering evidence, and disposable-library mutation results. Include cue/grid preservation, playlist ordering, stale-plan rejection, partial failure, and restart/reconciliation scenarios. Existing personal libraries remain read-only during verification.
