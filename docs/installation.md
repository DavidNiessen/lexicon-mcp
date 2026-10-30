# Installation and troubleshooting

## Requirements

Install **Node.js 24**, which includes `npm` and `npx`. Run Lexicon DJ on Windows or macOS and enable the Local API in **Settings → Integrations**. The default URL is `http://127.0.0.1:48624/v1`. Keep Lexicon open while using library tools. The MCP host supplies the LLM; no additional model key is required.

## Interactive installation

Open the [Releases page](https://github.com/DavidNiessen/lexicon-mcp/releases) and copy its exact command. Each release also includes `INSTALL.md`:

```sh
npx --yes https://github.com/DavidNiessen/lexicon-mcp/releases/download/vVERSION/lexicon-mcp-VERSION.tgz install
```

Replace `VERSION` in both places with the release's version, including any prerelease suffix. This downloads directly from GitHub; no npm account is required. Select the agents to configure, then choose user or project scope where supported. Restart or reconnect those agents afterward.

The installer copies its bundled Node program to persistent application-data storage and registers that stable path. Configuration therefore does not depend on the temporary `npx` cache remaining present. The configured command uses your Node executable, which must remain installed. Updating Node may require rerunning the installer.

Unrelated servers/settings are preserved. Files are backed up before modification; malformed configuration is rejected. Existing conflicting `lexicon` entries require explicit replacement. Installation does not run library tools or automatically grant tool approvals.

## Explicit selection and dry runs

```sh
# Preview a project setup without configuration or runtime changes.
npx --yes https://github.com/DavidNiessen/lexicon-mcp/releases/download/vVERSION/lexicon-mcp-VERSION.tgz install --agent cursor --scope project --dry-run --yes

# Select agents without an interactive agent prompt.
npx --yes https://github.com/DavidNiessen/lexicon-mcp/releases/download/vVERSION/lexicon-mcp-VERSION.tgz install --agent codex --agent cursor --scope user --yes
```

Use `--help` for the release's exact agent identifiers and options. Project scope targets the current working directory. A user-only agent cannot be installed at project scope.

| Agent identifier | User scope                                                              | Project scope        |
| ---------------- | ----------------------------------------------------------------------- | -------------------- |
| `codex`          | `$CODEX_HOME/config.toml`, default `~/.codex/config.toml`               | `.codex/config.toml` |
| `claude-code`    | `~/.claude.json`                                                        | `.mcp.json`          |
| `claude-desktop` | Claude's application-data `claude_desktop_config.json` on Windows/macOS | Unsupported          |
| `cursor`         | `~/.cursor/mcp.json`                                                    | `.cursor/mcp.json`   |
| `vscode`         | `$COPILOT_HOME/mcp-config.json`, default `~/.copilot/mcp-config.json`   | `.vscode/mcp.json`   |

The VS Code user destination uses its current portable Copilot format (`mcpServers`); project configuration uses the VS Code format (`servers`). The installer writes the appropriate native wrapper. See [VS Code configuration destinations](https://code.visualstudio.com/docs/agent-customization/mcp-servers) and [Codex MCP configuration](https://developers.openai.com/codex/mcp/).

`--dry-run` writes no configuration, backups, or runtime files. npm may still download the installer into its cache. `--force` permits replacing a conflicting registration; it authorizes no Lexicon library changes.

## Updating and uninstalling

Rerun `install` from a newer release to update selected registrations. Inspect a dry run first; use `--force` only when replacing a conflicting registration is intended. Backups remain available for recovery.

Use the same agent and scope selection with `uninstall` to remove registrations, then restart affected agents. Other MCP servers are preserved. Saved plans, reports, and audit records are separate from agent registration and should be retained unless deliberately removed.

## MCP UI previews

Compatible hosts can render visual change-plan, health-report, and prepared-set previews. Pending plans have Apply/Cancel controls. Clients with MCP form elicitation can use a native review dialog instead. Installation does not add an embedded renderer to a host. Ask the assistant to call `lexicon_ui_status` to check the connected client's capabilities. Clients with neither UI path can inspect text/JSON reports, but cannot apply protected changes. Chat replies do not approve a plan.

The preview canvas is transparent and follows the host theme and style tokens. Both color schemes are declared before first paint so browsers do not add an opaque iframe backdrop when Claude is dark and the system preference is light, or vice versa. ChatGPT widget state restores the view after iframe remounts when available. Approval credentials are not persisted with that snapshot. Returning to a chat never applies or cancels a plan, and closing a native dialog leaves it pending. If an older preview is blank, white, or its approval has expired, reopen that existing plan after upgrading and restarting the client; old cached templates may retain their original UI code.

Rendering and button calls are separate host capabilities. A standard MCP Apps host must advertise `hostCapabilities.serverTools` for Apply/Cancel calls. A display-only host can still show the preview, with actions disabled. The Claude error `IPC not available for MCP tool call` matches an [upstream report about local Code-tab view forwarding](https://github.com/anthropics/claude-ai-mcp/issues/1181); it is not a Lexicon API error. Try Claude's Chat surface or another host that supports widget tool calls, reconnect, and reopen the pending plan. The component never retries the action through another bridge automatically.

## Manual configuration and development

After `pnpm install --frozen-lockfile` and `pnpm build`, clients using `mcpServers` can launch the development bundle:

```json
{
  "mcpServers": {
    "lexicon": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/lexicon-mcp/packages/server/dist/cli.cjs",
        "serve",
        "--transport",
        "stdio"
      ]
    }
  }
}
```

Use escaped backslashes for Windows JSON paths. Agents may use TOML or different wrapper keys; prefer the installer or consult the agent's official documentation. Stdout is reserved for MCP protocol traffic.

## Local HTTP

Set `LEXICON_HTTP_TOKEN` to a high-entropy secret. Run the package with `serve --transport http --port 48625` instead of `install`, then configure a Streamable HTTP client for `http://127.0.0.1:48625/mcp` with `Authorization: Bearer YOUR_TOKEN`. The endpoint accepts loopback access only and validates Host/Origin. Never commit real tokens.

## Configuration

Use `config show` to inspect configuration or `config init` to initialize it. Environment overrides include `LEXICON_BASE_URL`, `LEXICON_DATA_DIR`, and `LEXICON_HTTP_TOKEN`. Plans, audits, and job reports live in user application data. Use a separate data directory for disposable-library tests.

## Migration from previous releases

The companion plugin and native executable downloads have been removed. If you previously installed the plugin, close Lexicon, remove only its `lexicon-mcp-companion-*.zip` from `Documents/Lexicon/Plugins`, and restart Lexicon. Remove old executable files after the new selected-agent registration works. The installer does not delete personal application files or library data.

## Troubleshooting

| Symptom                     | Action                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npx` is not found          | Install Node.js 24, reopen the terminal, and check `node --version` and `npx --version`.                                                               |
| Download returns 404        | Copy the exact release command; replace both `VERSION` placeholders.                                                                                   |
| Scoped package returns 404  | Use the GitHub tarball command; the package name is not currently published to npm.                                                                    |
| Conflicting registration    | Preview and use `--force` if replacement is intended.                                                                                                  |
| Invalid agent configuration | Repair the file; malformed configuration is never overwritten.                                                                                         |
| Connection refused          | Start Lexicon, enable its API, and run `doctor`.                                                                                                       |
| Agent cannot find Node      | Rerun installation after Node path changes, then restart the agent.                                                                                    |
| Preview is text only        | Call `lexicon_ui_status`. Use the native MCP review dialog if supported; otherwise reconnect with a UI-capable client. Protected changes stay blocked. |
| HTTP unauthorized           | Match server and client bearer tokens.                                                                                                                 |
| Stale plan                  | Inspect changed data and create a fresh preview.                                                                                                       |
| Mutation timed out          | Inspect current data and saved outcomes before retrying.                                                                                               |

Redact private paths, titles, identifiers, and tokens in bug reports. Include versions and a synthetic reproduction.
