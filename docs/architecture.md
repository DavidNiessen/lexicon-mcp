# Architecture

The server is a local integration process. Lexicon remains the authority for library data; the MCP host supplies the language model.

```mermaid
flowchart LR
  Installer[npx installer] --> Config[Selected agent configuration]
  Config --> Host[MCP host]
  Host --> Transport[stdio or loopback HTTP]
  Transport --> Application[Tool routing and application workflows]
  Application --> Domain[Validation and change plans]
  Application --> API[Lexicon adapter]
  API --> Lexicon[Lexicon Local API]
  Application --> Storage[Plans, jobs and audit records]
  Application --> Preview[MCP UI previews]
```

MCP and CLI adapters handle wire formats, authentication, and presentation. Application services orchestrate operations and workflows. Domain validation and change policy remain transport-independent. Infrastructure provides HTTP, local storage, and locking. Feature modules own their schemas and behavior.

The Lexicon adapter uses documented API operations. It encodes GET parameters and sends JSON mutation bodies. Reads have bounded concurrency/retries; writes are serialized and coordinated across local processes. Ambiguous writes are never automatically replayed. Commands distinguish direct operations, asynchronous dispatch, dialog launch, and unsupported actions.

Change plans retain explicit IDs, before-values, desired edits, and a content hash. Application revalidates snapshots and records per-operation progress. Jobs persist reports without replaying interrupted work. Atomic JSON writes and JSONL logs avoid a native database dependency.

## Installation and distribution

esbuild produces a bundled CommonJS Node.js 24 program. One platform-neutral tarball contains the CLI, installer, MCP server, embedded preview assets, license notices, and SBOM. It is executed by `npx` directly from a GitHub release, without npm registry publication.

The installer adapts selected agents' native configuration formats, preserves unrelated settings, detects conflicts, and backs up modifications. It copies the bundled runtime to persistent user storage and records an absolute Node command and stable bundle path. A dry run produces no configuration or runtime files. Installer tests use isolated paths, never the user's real agent settings.

## Preview boundary

MCP UI resources provide visual context for proposed changes and reports. Text and structured JSON remain available to every client. Rendering is a host capability; the server does not claim that every selectable agent renders MCP Apps. Preview content must escape untrusted library metadata and respect host sandboxing. The UI never bypasses change-plan validation or client-mediated confirmation.

## Decisions

- Use official Lexicon APIs; avoid database writes and unattended UI automation.
- Keep stdio as the default and authenticate loopback HTTP.
- Maintain client-mediated write confirmation.
- Ship a Node package with an interactive selected-agent installer.
- Generate dependency license notices and a build/runtime component inventory.
- Publish prereleases for successful main builds; manually select stable releases.
- Keep npm registry publication disabled until separately configured.

Handwritten source and test files stay below 400 lines. Upstream specifications, generated schemas, and synthetic fixtures are exempt. CI checks sizes, dependency boundaries, types, and behavior.
