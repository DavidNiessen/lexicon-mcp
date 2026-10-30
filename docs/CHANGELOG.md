# Changelog

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
