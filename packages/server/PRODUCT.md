# Lexicon MCP preview surface

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

DJs use a local LLM client to inspect and manage an existing Lexicon library.

## Product Purpose

Preview surfaces expose proposed changes, library reports, and prepared sets. Approval is a separate native MCP form or an explicit chat exchange when native forms are unavailable.

## Operating Context

The interface is an embedded MCP Apps or MCP-UI resource. It shares tool results with a chat client. Plain-text and structured results remain available when the client cannot render UI.

## Capabilities and Constraints

Every preview is read-only. Filtering and disclosure work locally; the widget has no Apply/Cancel buttons, write credentials, or tool-call bridge. Native MCP forms take precedence when advertised. Otherwise, the assistant presents the exact saved plan and faithfully relays the user's explicit approval or cancellation through the chat decision tool. The server cannot inspect the chat transcript. All persistent library writes require a plan, including single-track edits. Library metadata is untrusted. No external scripts, fonts, images, or network calls are needed to render a preview.

## Product Principles

- Show the affected target and before/after values together.
- Distinguish proposals from completed or failed outcomes.
- Bound preview output and disclose when it is shortened.
- Use the host's theme and familiar table/filter controls.

## Open Decisions

Inferred from the existing code and explicit task: the surface follows the host theme and uses system fonts. No independent brand or client-specific rendering support is claimed.
