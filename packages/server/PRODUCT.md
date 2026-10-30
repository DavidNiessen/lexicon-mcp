# Lexicon MCP preview surface

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

DJs use a local LLM client to inspect and manage an existing Lexicon library.

## Product Purpose

Preview surfaces expose proposed changes, library reports, and prepared sets. Approval is a separate question sent by the assistant in chat, using its own native choices when available or an explicit text reply otherwise.

## Operating Context

The interface is an embedded MCP Apps or MCP-UI resource. It shares tool results with a chat client. Plain-text and structured results remain available when the client cannot render UI.

## Capabilities and Constraints

Every preview is read-only. Filtering and disclosure work locally; the widget has no Apply/Cancel buttons, write credentials, or tool-call bridge. Review prepares an exact-plan question that the assistant must send using its own native Approve changes/Cancel controls when available, such as Claude Code’s AskUserQuestion, or as a plain chat question. The server does not open an approval dialog. The assistant faithfully relays the user’s explicit answer; the server cannot inspect the transcript. All persistent library writes require a plan, including single-track edits. Library metadata is untrusted. No external scripts, fonts, images, or network calls are needed to render a preview.

## Product Principles

- Show the affected target and before/after values together.
- Distinguish proposals from completed or failed outcomes.
- Bound preview output and disclose when it is shortened.
- Use the host's theme and familiar table/filter controls.

## Open Decisions

Inferred from the existing code and explicit task: the surface follows the host theme and uses system fonts. No independent brand or client-specific rendering support is claimed.
