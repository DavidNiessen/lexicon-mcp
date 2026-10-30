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

Filtering and disclosure are read-only. Apply and Cancel use an app-only tool with a short-lived grant bound to the displayed plan. No change runs until a user clicks a confirmation control. Text chat confirmation cannot apply a plan. Library metadata is untrusted. No external scripts, fonts, images, or network calls are needed to render a preview.

## Product Principles

- Show the affected target and before/after values together.
- Distinguish proposals from completed or failed outcomes.
- Bound preview output and disclose when it is shortened.
- Use the host's theme and familiar table/filter controls.

## Open Decisions

Inferred from the existing code and explicit task: the surface follows the host theme and uses system fonts. No independent brand or client-specific rendering support is claimed.
