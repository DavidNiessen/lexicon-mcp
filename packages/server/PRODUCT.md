# Lexicon MCP preview surface

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

DJs use a local LLM client to inspect and manage an existing Lexicon library.

## Product Purpose

The user requested MCP UI previews. Preview surfaces expose proposed changes, library reports, and prepared sets before the assistant proceeds.

## Operating Context

The interface is an embedded MCP Apps or MCP-UI resource. It shares tool results with a chat client. Plain-text and structured results remain available when the client cannot render UI.

## Capabilities and Constraints

The preview is read-only: filtering and disclosure never apply mutations. Library changes continue through the existing chat-confirmed plan/apply tools. Library metadata is untrusted. No external scripts, fonts, images, or network calls are needed to render a preview.

## Product Principles

- Show the affected target and before/after values together.
- Distinguish proposals from completed or failed outcomes.
- Bound preview output and disclose when it is shortened.
- Use the host's theme and familiar table/filter controls.

## Open Decisions

Inferred from the existing code and explicit task: the surface follows the host theme and uses system fonts. No independent brand or client-specific rendering support is claimed.
