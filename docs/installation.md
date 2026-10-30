# Installation and troubleshooting

## Requirements

Run Lexicon DJ on Windows or macOS and enable the Local API in **Settings → Integrations**. The default URL is `http://127.0.0.1:48624/v1`. Keep Lexicon open while using library tools. The MCP host supplies the LLM; the server does not require an additional model key.

## Executable

Download the archive matching your operating system and CPU from the repository's release. Verify its SHA-256 against `SHA256SUMS`, then extract the archive into a permanent directory. On macOS run `chmod +x /absolute/path/lexicon-mcp` if extraction did not preserve executable permissions.

The current packaging produces ad-hoc signed macOS binaries and unsigned Windows binaries. A downloaded executable may prompt for operating-system approval. Inspect the release source, checksum, and provenance before approving it. Trusted signing/notarization requires maintainer credentials and is not claimed for candidate builds.

Run the executable with `--version`, then `doctor`. The doctor checks connectivity without modifying the library.

## MCP client configuration

For clients using an `mcpServers` configuration:

```json
{
  "mcpServers": {
    "lexicon": {
      "command": "/absolute/path/lexicon-mcp",
      "args": ["serve", "--transport", "stdio"]
    }
  }
}
```

Windows uses an absolute `.exe` path and escaped backslashes in JSON. Follow your host's documentation if it uses a different configuration format. Restart or reconnect the host after changes. Stdout is reserved for protocol traffic; diagnostics go to stderr.

## Local HTTP

Set `LEXICON_HTTP_TOKEN` to a high-entropy secret and run:

```sh
lexicon-mcp serve --transport http --port 48625
```

Configure a Streamable HTTP client for `http://127.0.0.1:48625/mcp` with `Authorization: Bearer YOUR_TOKEN`. The server accepts loopback access only. It validates Host/Origin and does not support remote clients or public tunnels. Never put a real token in committed client examples.

## Node package

Node.js 24 is required for the package distribution. Install the release tarball with `npm install --global ./davidniessen-lexicon-mcp-0.1.0-win32-x64.tgz` (substitute the downloaded filename), then use `lexicon-mcp` as the host command. The tarball bundles runtime dependencies. The package is not published to the public npm registry by the release workflow.

For development, use the pinned pnpm version and `pnpm install --frozen-lockfile`, then `pnpm build`. Configure the host to launch `node` with an absolute path to `packages/server/dist/cli.cjs` followed by `serve --transport stdio`.

## Companion plugin

Copy `lexicon-mcp-companion-VERSION.zip` into `Documents/Lexicon/Plugins` and restart Lexicon. Run **MCP: Inspect Selection**, **MCP: Inspect Player and Queue**, or **MCP: Setup Help** from the Plugins menu. Reports can be shared with your assistant. The plugin requests read access only and does not host the server or approve changes.

The plugin is optional: the MCP API tools can inspect selection/player state without it. To remove it, close Lexicon, remove this plugin ZIP, and restart Lexicon.

## Configuration

`lexicon-mcp config show` displays effective configuration; `config init` initializes local configuration. Supported environment overrides include `LEXICON_BASE_URL`, `LEXICON_DATA_DIR`, and `LEXICON_HTTP_TOKEN`. Plans, audits, and job reports belong in user application data, never in the source checkout. Use a separate data directory for disposable-library tests.

## Troubleshooting

| Symptom               | Action                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Connection refused    | Start Lexicon, enable its API, and run `doctor`.                                                            |
| API denied            | Check the allowed-application settings in Lexicon.                                                          |
| Unsupported operation | Check the compatibility matrix and the installed Lexicon version.                                           |
| HTTP unauthorized     | Set the same token in the server environment and client authorization header.                               |
| HTTP origin rejected  | Use a native local client or an explicitly supported local origin; do not expose the endpoint to a website. |
| Stale plan            | Inspect changed library data and create a fresh plan.                                                       |
| Mutation timed out    | Inspect the target and recorded outcome before retrying; the operation may already have happened.           |
| Plugin menu absent    | Confirm the ZIP contains `config.json`, place it in the correct Plugins folder, and restart Lexicon.        |

When reporting problems, redact paths, titles, identifiers you consider private, and tokens. Include versions and a synthetic reproduction.
