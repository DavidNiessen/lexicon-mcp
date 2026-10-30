# Lexicon MCP

Manage your [Lexicon DJ](https://www.lexicondj.com/) library from an MCP-compatible AI assistant. Search tracks, inspect library health, organize playlists, and review bulk changes before applying them.

Runs locally through Lexicon's documented Local API. No companion plugin or native installer is needed.

## Quick start

### 1. Prepare Lexicon and Node.js

- Install **[Node.js 24](https://nodejs.org/en/download)**, which includes `npm` and `npx`. Check with `node --version`; it should start with `v24.`.
- Open **Lexicon DJ** on Windows or macOS and enable **Settings → Integrations → Local API**. Keep Lexicon running while using library tools.
- Choose an MCP client: **Claude Desktop, Claude Code, Codex, Cursor, or VS Code / Copilot**. Your client supplies the model; this server needs no separate model API key.

### 2. Run the installer

Copy one command into your terminal. Packages download directly from GitHub; no npm account is required.

#### Stable release

For published stable releases. The release workflow maintains this command separately from prereleases.

<!-- install:release:start -->

```sh
npx --yes https://github.com/DavidNiessen/lexicon-mcp/releases/download/v0.1.0/lexicon-mcp-0.1.0.tgz install
```

<!-- install:release:end -->

#### Prerelease

The newest verified build from `main`. Choose this channel to try current features before a stable release.

<!-- install:prerelease:start -->

```sh
npx --yes https://github.com/DavidNiessen/lexicon-mcp/releases/download/v0.1.0-dev.41136651697.1/lexicon-mcp-0.1.0-dev.41136651697.1.tgz install
```

<!-- install:prerelease:end -->

[All releases and package checksums](https://github.com/DavidNiessen/lexicon-mcp/releases)

### 3. Select your agents and restart them

The installer asks for the installation scope and the agents to configure:

- **User scope:** available across projects. Use this for Claude Desktop.
- **Project scope:** available in the current directory for clients that support it. Run the command from that project.

It preserves unrelated settings, backs up changed configurations, and saves the server in persistent user storage. You can select several agents in one run. **Restart or reconnect each selected client** to load the server and its tools.

To skip the selection prompts, append the relevant options to the install command above:

| Goal                                                          | Options after `install`                                |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| Install for Claude Desktop                                    | `--agent claude-desktop --scope user --yes`            |
| Install for Claude Code and Codex                             | `--agent claude-code --agent codex --scope user --yes` |
| Preview a Cursor project setup without changing configuration | `--agent cursor --scope project --dry-run --yes`       |
| Install for VS Code / Copilot                                 | `--agent vscode --scope user --yes`                    |

See [agent configuration paths and scope support](docs/installation.md#explicit-selection-and-dry-runs) for details. `--dry-run` leaves configuration and runtime files unchanged; npm may still download the package into its cache.

### 4. Try your first request

Start with a small, read-only check:

> Use Lexicon to check MCP UI support and list five tracks. Do not change anything.

Then try a report or a reviewed change:

> Audit my library's metadata and show the findings without making changes.

> Prepare one plan to add an existing tag to selected tracks, show its preview, and request approval.

Plan creation and inspection return compact text summaries. The assistant shows **one read-only preview widget**, then sends a separate approval question in chat. It should offer **Approve changes** and **Cancel** through its own native question controls when available, such as Claude Code’s `AskUserQuestion`; otherwise it asks a plain chat question. Only your explicit answer authorizes the exact saved plan. The preview never applies changes by itself.

## What you can do

| Area                | Capabilities                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Tracks              | Browse and search; inspect and edit metadata, tags, file references, cues, loops, and beatgrids.                                |
| Playlists           | Work with playlists, folders, smartlists, and custom-tag categories; compare membership and propose merges or ordering changes. |
| Library reports     | Find metadata/file/cue/grid issues, inspect duplicate candidates, and prepare cleanup proposals.                                |
| Set preparation     | Rank existing tracks using BPM, key, energy, duration, and tag criteria, with reasons for the results.                          |
| Player and commands | Inspect player/queue state and discover documented Lexicon application commands.                                                |
| Large workflows     | Run cancellable jobs, retrieve paginated results, and explicitly export reports as JSON or CSV.                                 |

All persistent library edits require a saved plan and explicit approval, including edits to a single track. Splitting a bulk request into individual calls cannot bypass review. Plans record exact targets, before-values, and per-operation outcomes; stale plans are rejected. The assistant should prepare one plan for the task. See [changes and recovery](docs/changes.md).

This is an independent integration and requires Lexicon DJ for live library access. Client UI support and Lexicon compatibility vary; see the [verification record](docs/compatibility.md). No audio or proprietary Lexicon implementation is distributed.

## Update or remove

- **Update:** rerun the install command for your preferred channel and select the agents to update, then restart them.
- **Remove:** use the same command with `uninstall` instead of `install`, keeping your agent and scope selection. Restart the affected clients afterward.

Other MCP servers and saved library reports remain separate from registration. See [updating and uninstalling](docs/installation.md#updating-and-uninstalling) for details.

## Troubleshooting

| Problem                               | Try this                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx` is not found                    | Install Node.js 24, reopen the terminal, then check `node --version` and `npx --version`.                                                     |
| Client cannot connect                 | Keep Lexicon open, enable its Local API, then restart the MCP client. The default upstream is `http://127.0.0.1:48624/v1`.                    |
| No widget appears                     | Ask the assistant to call `lexicon_ui_status`. The host supplies the renderer; approval is a separate question sent by the assistant in chat. |
| Old, blank, or white preview          | Update, restart the client, and ask to reopen the saved plan. Older chat messages can retain cached UI code.                                  |
| Existing registration conflicts       | Review a dry run and the [replacement instructions](docs/installation.md); use `--force` only when you intend to replace that registration.   |
| Preview is stale or a write times out | Inspect the saved plan and current data before proposing another change. Do not blindly retry.                                                |

Previews do not use widget tool-call bridges. After showing the proposed values, the assistant must send its own approval question in chat; it must not direct you to an approval button inside the preview. Lexicon MCP does not open a server-side approval dialog. If native chat question controls are unavailable, the assistant asks for an explicit text reply. Update and restart the client to load this flow. The installer removes the former `LEXICON_APPROVAL_UI` override while preserving other settings.

`lexicon_get_change_plan` only inspects data. `lexicon_preview_change_plan` shows the read-only widget, and `lexicon_review_change_plan` prepares the exact-plan question that the assistant must send. Approval happens through the assistant’s chat question, never inside the preview or a separate Lexicon DJ window.

More: [installation and troubleshooting](docs/installation.md), including manual configuration, read-only mode, and authenticated loopback HTTP.

## Documentation

- [Installation and configuration](docs/installation.md)
- [Tools, commands, workflows, and previews](docs/tools.md)
- [Review policy, outcomes, and recovery](docs/changes.md)
- [Architecture](docs/architecture.md)
- [Compatibility and verification](docs/compatibility.md)
- [Development and releases](docs/development.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Code of conduct](CODE_OF_CONDUCT.md)

## Develop

Use Node.js 24 and the pnpm version pinned in `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm package
```

Packaging creates a platform-neutral Node tarball, installation guide, checksums, SBOM, and dependency notices. CI verifies Linux, Windows, and macOS. Successful `main` builds publish prereleases; the manual **Release** workflow can publish either channel. After publication, it updates only that channel's marked install block above. npm registry publishing is disabled.

## License

[MIT](LICENSE). Dependency licenses accompany release artifacts.
