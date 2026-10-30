# Lexicon MCP

Let a local MCP assistant inspect and manage your Lexicon DJ library. The server connects to Lexicon's documented Local API and offers library tools, reviewed change plans, command discovery, and library workflows. An optional Lexicon plugin reports selection and player context.

**Release candidate:** automated checks and the compatibility matrix describe the available evidence. Real mutation tests belong in a disposable library. This is an independent integration; Lexicon DJ is a separate application and is required for live library access.

## Get started

1. Start Lexicon and enable its Local API under **Settings → Integrations**.
2. Obtain a release archive for Windows x64 or macOS arm64/x64 from this repository's private Releases page. Extract it and run `lexicon-mcp doctor` (`lexicon-mcp.exe doctor` on Windows).
3. Configure your MCP host to launch the executable with `serve --transport stdio`.
4. Ask the assistant to inspect the library, then request a preview before applying bulk edits.

```json
{
  "mcpServers": {
    "lexicon": {
      "command": "C:\\Tools\\lexicon-mcp\\lexicon-mcp.exe",
      "args": ["serve", "--transport", "stdio"]
    }
  }
}
```

On macOS, replace `command` with the executable's absolute path. See [installation](docs/installation.md) for HTTP setup, Node package installation, and plugin installation.

## Features

- Track browsing/search, metadata, file references, cues, loops, and beatgrids.
- Playlists, folders, smartlists, custom tags, and categories.
- Player/queue inspection and a searchable catalog of application commands.
- Library health, duplicate candidates, metadata cleanup proposals, playlist comparison/merge, and explained set preparation.
- Persisted change previews, per-operation outcomes, audit records, and long-running jobs.
- Local stdio or authenticated loopback HTTP transport.

Individual low-impact writes can run directly. Bulk edits, deletions, file-reference changes, and destructive commands require a separate plan/apply flow. The assistant obtains your approval in chat; the server cannot independently prove that a human approved the conversation. See [changes and recovery](docs/changes.md).

## Develop

Use Node.js 24 and the pnpm version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm package
```

Packaging produces a local Node tarball, companion ZIP, native executable archive, checksums, SBOM, and third-party notices. Public npm publication and public release are disabled.

## Documentation

- [Installation and troubleshooting](docs/installation.md)
- [Tools, commands, and workflows](docs/tools.md)
- [Changes and recovery](docs/changes.md)
- [Architecture](docs/architecture.md)
- [Compatibility and verification](docs/compatibility.md)
- [Development and releases](docs/development.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT. Dependency and bundled runtime licenses accompany release artifacts. No audio or proprietary Lexicon implementation is distributed.
