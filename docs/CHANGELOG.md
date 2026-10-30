# Changelog

## Unreleased — Read-only previews and explicit approval

- Make `lexicon_preview_change_plan` the sole read-only plan widget, with no Apply/Cancel controls, credentials, or tool-call bridge.
- Keep model-visible plan responses compact and bounded, with paginated inspection instead of full snapshots and operation payloads.
- Require reviewed plans for every persistent library mutation, including individual edits, and prepare one plan per task.
- Use native MCP forms when advertised; otherwise allow an explicit user chat decision bound to a 10-minute review marker and exact plan hash.
- Preserve read-only, stale-plan, partial-failure, and replay protections. Document that the assistant relays actual consent and the server cannot verify a chat transcript.
- Remove the retired installer approval override while preserving unrelated settings. Earlier approval/UI entries below describe historical behavior superseded by this flow.

## Unreleased — Automatic native approval in Claude

- Configure Claude Desktop/Code installations and upgrades to select native MCP approval automatically.
- Route the ordinary review tool through native forms without a widget template or an extra fallback call; keep read-only previews and other agents' embedded approvals.
- Expose the selected approval mode in UI status and leave unsupported, dismissed, unchecked, and read-only plans blocked or pending.

## Unreleased — Inspection guidance

- Put approval routing before large saved-plan snapshots so truncation retains the instructions.
- Explicitly mark inspection as opening no UI and return supported review tool names without automatically reopening anything.
- Clarify inspection and review tool descriptions so assistants request approval in the MCP client instead of directing users to Lexicon DJ.

## Unreleased — Native review fallback

- Add `lexicon_review_change_plan_native` for a saved plan when embedded widget buttons cannot forward actions.
- Advertise the native route only when form elicitation is available; do not render a second widget or expose approval credentials.
- Clarify that approval happens in the MCP client and that pending plan data does not prove a dialog is visible.
- Correct native form wording: unchecked or dismissed forms leave the plan pending.

## Unreleased — Onboarding and release commands

- Add the supplied high-resolution preview screenshot and a step-by-step README for installation, first use, updates, and troubleshooting.
- Keep stable and prerelease install commands in separate managed README blocks and update only the published channel after a successful release.
- Preserve surrounding content and concurrent documentation edits using validated block replacements and content-SHA conflict checks.
- Include the README preview image in packaged distributions.
- Distinguish preview rendering from host tool-call support and explain Claude's unavailable-IPC error without automatically retrying changes.

## Unreleased — One plan widget and Claude theming

- Separate plan creation and inspection from display: only `lexicon_review_change_plan` opens a plan widget or dialog and issues an approval credential.
- Keep proposal generation and job polling data-only; add `lexicon_show_report` for visual read-only reports without changing library data.
- Declare supported color schemes before first paint and follow the host scheme, preventing browsers from painting a white iframe canvas in dark mode.
- Apply host color and font tokens, preserve partial updates, and retain historical resource URIs.
- Verify rendered pixels through nested light/dark host frames, not just transparent CSS values.

## Unreleased — Preview lifecycle

- Make the preview canvas transparent and request no host border.
- Restore bounded widget snapshots, filters, and disclosure after remounts without persisting approval credentials.
- Handle canonical ChatGPT tool-result envelopes, partial globals, delayed bridges, and visibility changes.
- Keep terminal outcomes stable when hosts replay the original pending tool result.
- Preserve historical resource URIs so older conversations can resolve preview templates after upgrades.
- Leave dismissed native reviews pending and remove model-callable cancellation.
- Keep Apply/Cancel interactions in the existing preview instead of advertising another template.

## Unreleased — UI approvals

- Replace chat confirmation and the model-callable apply tool with explicit UI approvals.
- Add Apply/Cancel controls, expiring UI-private credentials, and a versioned preview resource.
- Add native MCP review dialogs for clients without embedded Apps and capability diagnostics.
- Reject protected changes when UI approval is unavailable, invalid, expired, or stale.

## Unreleased

- Replace native executable downloads with one platform-neutral Node package runnable through npx.
- Add a selected-agent installer with scoped configuration, dry runs, backups, and explicit replacement.
- Remove the Lexicon companion plugin from source and release artifacts.
- Add MCP UI previews with text/JSON fallbacks.
- Keep automatic main-build prereleases and manually selected stable releases, with exact npx commands in release notes.

## 0.1.0 — initial private release candidate

- Add the documented Lexicon Local API operation registry and command catalog.
- Expose library tools, resources, prompts, and local MCP transports.
- Add persisted change previews, review/application, audit records, and recovery states.
- Add library health, duplicate candidates, cleanup proposals, playlist operations, and set preparation workflows.
- Add read-only companion actions for selection/player context and setup help.
- Add contributor documentation, synthetic tests, CI, executable packaging, dependency inventory, and private draft releases.

Compatibility and completed verification are recorded in [compatibility](compatibility.md) and CI results. This candidate does not claim live mutation or all-platform validation until that evidence is recorded.
