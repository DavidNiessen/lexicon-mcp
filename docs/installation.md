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

Compatible hosts can render visual change-plan, health-report, and prepared-set previews. These widgets are read-only and have no approval buttons, write credentials, or tool-call bridge. Plan creation and inspection return compact text; `lexicon_preview_change_plan` explicitly shows the saved plan as a widget. The assistant should prepare one plan for a task, including when it affects only one track.

The preview canvas is transparent and follows the host theme and style tokens. Both color schemes are declared before first paint. Widget state restores a bounded view after remounts when supported. Returning to a chat never applies or cancels a plan. If an older preview is blank, white, or still shows obsolete buttons, upgrade, restart the client, and ask to preview the existing saved plan; old chat messages can retain cached UI code.

Approval is separate from rendering. `lexicon_review_change_plan` requests a native MCP form whenever the connected client advertises form support. The user checks the approval field and submits. Closing, declining, or leaving it unchecked keeps the plan pending. If an advertised native form fails to display, report that host failure instead of switching to chat approval.

When native forms are not advertised, review opens an exact-plan chat review. The assistant presents the plan and asks for explicit approval or cancellation, then relays the user's reply using `lexicon_decide_change_plan`. The review expires after 10 minutes and binds the plan ID/hash. Read-only mode, stale source checks, and replay protections apply. The server cannot read the transcript; the assistant must faithfully relay the actual user's consent. The chat route is rejected for clients advertising native forms.

`lexicon_ui_status` reports the current client's capabilities and selected review path. Installation supplies neither a renderer nor native forms. The former `LEXICON_APPROVAL_UI` environment override is ignored and removed from managed registrations during upgrades; other environment settings are preserved. Old `approvalUi` configuration fields remain accepted for compatibility but no longer affect routing.

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

Use `config show` to inspect configuration or `config init` to initialize it. Environment overrides include `LEXICON_BASE_URL`, `LEXICON_DATA_DIR`, and `LEXICON_HTTP_TOKEN`; `LEXICON_READ_ONLY=true` prohibits writes. Plans, chat-review markers, audits, and job reports live in user application data. Use a separate data directory for disposable-library tests. The deprecated `approvalUi`/`LEXICON_APPROVAL_UI` settings are ignored.

## Migration from previous releases

The companion plugin and native executable downloads have been removed. If you previously installed the plugin, close Lexicon, remove only its `lexicon-mcp-companion-*.zip` from `Documents/Lexicon/Plugins`, and restart Lexicon. Remove old executable files after the new selected-agent registration works. The installer does not delete personal application files or library data.

## Troubleshooting

| Symptom                     | Action                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npx` is not found          | Install Node.js 24, reopen the terminal, and check `node --version` and `npx --version`.                                                         |
| Download returns 404        | Copy the exact release command; replace both `VERSION` placeholders.                                                                             |
| Scoped package returns 404  | Use the GitHub tarball command; the package name is not currently published to npm.                                                              |
| Conflicting registration    | Preview and use `--force` if replacement is intended.                                                                                            |
| Invalid agent configuration | Repair the file; malformed configuration is never overwritten.                                                                                   |
| Connection refused          | Start Lexicon, enable its API, and run `doctor`.                                                                                                 |
| Agent cannot find Node      | Rerun installation after Node path changes, then restart the agent.                                                                              |
| Preview is text only        | Call `lexicon_preview_change_plan` for the saved plan. Rendering depends on the host; native approval or the explicit chat fallback is separate. |
| HTTP unauthorized           | Match server and client bearer tokens.                                                                                                           |
| Stale plan                  | Inspect changed data and create a fresh preview.                                                                                                 |
| Mutation timed out          | Inspect current data and saved outcomes before retrying.                                                                                         |

Redact private paths, titles, identifiers, and tokens in bug reports. Include versions and a synthetic reproduction.
