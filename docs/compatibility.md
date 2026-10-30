# Compatibility and verification

This project is a release candidate until required platform, host, and disposable-library checks have passed. The table records evidence rather than assuming compatibility from a version number.

| Target                             | Evidence/status                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Lexicon Beta 1.11.113 on Windows   | Five read-only API smoke checks passed on 2026-10-30; live mutations remain unverified.                             |
| Other Lexicon stable/beta releases | Not claimed without testing.                                                                                        |
| Windows x64 executable             | Local SEA packaging, version launch, and isolated stdio MCP session passed on 2026-10-30.                           |
| macOS arm64 executable             | Matching runner build and smoke check required.                                                                     |
| macOS x64 executable               | Matching runner build and smoke check required.                                                                     |
| Linux                              | Adapter/protocol development tests only; no Lexicon desktop compatibility claim.                                    |
| Node package                       | Node.js 24 required.                                                                                                |
| Companion plugin                   | Manifest and sandbox report tests provided; actual Lexicon GUI installation verification required.                  |
| MCP hosts                          | SDK client tests establish protocol behavior. Record a real host's name/version before claiming host compatibility. |

The checked-in API snapshot is the contract used for capability coverage. The upstream API's generic version does not identify every application capability. Unsupported behavior is reported explicitly; mutations are not probed merely to discover support.

## Safe live smoke test

Local evidence recorded on 2026-10-30: the Windows x64 executable was packaged using Node 24.16.0 SEA injection and passed its version launch smoke test. The read-only probe passed for tracks, playlists, tags, player, and queue on the installed Lexicon Beta 1.11.113. No live mutation, macOS launch, or GUI plugin verification is implied by these checks.

Packaging also launches the self-contained executable from an isolated temporary working directory with an empty PATH. It initializes a legacy-compatible MCP session, lists tools, and retrieves the analysis command schema without contacting Lexicon. GitHub-hosted CI execution is currently blocked by the account's Actions billing limit; workflow definitions are provided, but no successful hosted run is claimed.

GitHub also rejected enabling branch protection on this private repository because the account needs GitHub Pro for that feature. Until available, maintain the documented PR and passing-check gate manually; do not merge this candidate while hosted verification is unavailable.

With Lexicon running, execute `node scripts/live-smoke.mjs`. It issues only GET requests for a single track, playlists, tags, playing state, and queue. It reports reachability while withholding library contents. It does not test mutations, command dispatch, or claim broad live compatibility.

## Release acceptance record

For a stable release, record the commit, CI run, executable checksums, exact OS/CPU and Lexicon version, host version, plugin installation result, and disposable-library mutation results. Include cue/grid preservation, playlist ordering, stale-plan rejection, partial failure, and restart/reconciliation scenarios. Existing personal libraries remain read-only for verification.
