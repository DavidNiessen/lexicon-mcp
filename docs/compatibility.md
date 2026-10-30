# Compatibility and verification

This project is a release candidate until required platform, host, and disposable-library checks have passed. The table records evidence rather than assuming compatibility from a version number.

| Target                             | Evidence/status                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Lexicon Beta 1.11.113 on Windows   | Local API connectivity observed during planning. Implementation smoke-test evidence must be recorded separately.    |
| Other Lexicon stable/beta releases | Not claimed without testing.                                                                                        |
| Windows x64 executable             | Packaging workflow and launch smoke check provided; see CI results for executed evidence.                           |
| macOS arm64 executable             | Matching runner build and smoke check required.                                                                     |
| macOS x64 executable               | Matching runner build and smoke check required.                                                                     |
| Linux                              | Adapter/protocol development tests only; no Lexicon desktop compatibility claim.                                    |
| Node package                       | Node.js 24 required.                                                                                                |
| Companion plugin                   | Manifest and sandbox report tests provided; actual Lexicon GUI installation verification required.                  |
| MCP hosts                          | SDK client tests establish protocol behavior. Record a real host's name/version before claiming host compatibility. |

The checked-in API snapshot is the contract used for capability coverage. The upstream API's generic version does not identify every application capability. Unsupported behavior is reported explicitly; mutations are not probed merely to discover support.

## Safe live smoke test

With Lexicon running, execute `node scripts/live-smoke.mjs`. It issues only GET requests for a single track, playlists, tags, playing state, and queue. It reports reachability while withholding library contents. It does not test mutations, command dispatch, or claim broad live compatibility.

## Release acceptance record

For a stable release, record the commit, CI run, executable checksums, exact OS/CPU and Lexicon version, host version, plugin installation result, and disposable-library mutation results. Include cue/grid preservation, playlist ordering, stale-plan rejection, partial failure, and restart/reconciliation scenarios. Existing personal libraries remain read-only for verification.
