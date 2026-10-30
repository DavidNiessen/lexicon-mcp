# Lexicon MCP

Let a local MCP assistant inspect and manage your Lexicon DJ library. The server connects to Lexicon's documented Local API and provides library tools, reviewed change plans, command discovery, reports, and MCP UI previews.

## Install

Install **Node.js 24**, start Lexicon, and enable **Settings → Integrations → Local API**. Open the [Releases page](https://github.com/DavidNiessen/lexicon-mcp/releases) and copy its exact version-specific `npx` installation command:

```sh
npx --yes https://github.com/DavidNiessen/lexicon-mcp/releases/download/vVERSION/lexicon-mcp-VERSION.tgz install
```

Replace both `VERSION` placeholders with the release version. Select your agents and installation scope. The installer preserves unrelated settings, backs up changed configurations, and copies the bundled server into persistent user storage. Restart selected agents afterward.

Preview a project installation without changes:

```sh
npx --yes https://github.com/DavidNiessen/lexicon-mcp/releases/download/vVERSION/lexicon-mcp-VERSION.tgz install --agent cursor --scope project --dry-run --yes
```

This uses a GitHub release package directly and requires no npm login. The scoped package name is not currently published to npm. See [installation](docs/installation.md) for supported agents, updates, removal, and HTTP setup.

## Features

- Track browsing/search, metadata, file references, cues, loops, and beatgrids.
- Playlists, folders, smartlists, custom tags, and categories.
- Player/queue inspection and a searchable catalog of application commands.
- Library health, duplicate candidates, metadata cleanup, playlist comparison/merge, and explained set preparation.
- Persisted change previews, per-operation outcomes, audit records, and cancellable jobs.
- Local stdio or authenticated loopback HTTP transport.
- Visual previews for MCP UI-capable hosts, with text and structured JSON fallbacks.

Individual low-impact writes can run directly. Bulk edits, deletions, file-reference changes, and destructive commands require a separate plan/apply flow. The assistant obtains your approval in chat; the server cannot independently prove that a human approved a conversation. The preview UI does not bypass these checks. See [changes and recovery](docs/changes.md).

This independent integration requires Lexicon DJ for live library access. The MCP host supplies the model. Live write verification belongs in a disposable library; see the [compatibility record](docs/compatibility.md).

## Develop

Use Node.js 24 and the pnpm version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm package
```

Packaging produces one platform-neutral Node tarball, an installation guide, checksums, SBOM, and dependency notices. Successful main builds publish prereleases. The manual **Release** workflow selects prerelease or stable release publishing. npm registry publication remains disabled.

## Documentation

- [Installation and troubleshooting](docs/installation.md)
- [Tools, commands, workflows, and previews](docs/tools.md)
- [Changes and recovery](docs/changes.md)
- [Architecture](docs/architecture.md)
- [Compatibility and verification](docs/compatibility.md)
- [Development and releases](docs/development.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT. Dependency licenses accompany release artifacts. No audio or proprietary Lexicon implementation is distributed.
