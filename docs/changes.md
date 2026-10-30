# Changes and recovery

## Review policy

All persistent library mutations require an immutable saved plan and explicit approval, including edits to one track. Individual calls cannot be used to bypass review of a bulk task. Prepare one plan for the task whenever possible. Explicitly safe playback/navigation controls can remain immediate; read-only mode prohibits writes.

`lexicon_plan_changes` validates proposed operations and captures exact targets and before-values. Plan creation and `lexicon_get_change_plan` return compact, bounded text summaries rather than full before snapshots or operation payloads. Inspection supports `offset` and `limit` for bounded detail pages. The full plan remains saved locally and is used for validation and application.

Call `lexicon_preview_change_plan` to show the saved plan in a read-only widget. It has no approval controls, write credentials, or tool-call bridge. Planning and inspection do not create widgets. A preview is presentation, not approval.

Then call `lexicon_review_change_plan`. It prepares a review marker for the exact plan ID/hash, valid for 10 minutes, and returns an assistant-question response. The server does not open a native MCP approval form. Legacy `approval: "auto" | "chat"` arguments are accepted for compatibility but no longer change the flow.

The assistant must now send its own approval question in chat. Use native **Approve changes** and **Cancel** choices through the assistant’s question tool when available—for example, Claude Code’s `AskUserQuestion`. Otherwise ask a plain chat question. The assistant must not tell the user to find approval buttons in the preview or Lexicon DJ. MCP form capability does not prove that any question was shown.

After the user's explicit answer, the assistant calls `lexicon_decide_change_plan` with `id`, `hash`, `decision: "apply" | "cancel"`, and `confirmed: true`. Both native question-button answers and text answers use this same path. Missing/expired reviews, changed hashes, read-only mode, stale source data, and unsafe replays are rejected. A completed duplicate returns the recorded outcome without another write.

The server cannot read the chat transcript or prove who authored a relayed reply. The assistant must faithfully relay actual user consent and must never invent it, infer it from silence, or interpret a request to open the preview as approval. Internal approval credentials stay private. `lexicon_ui_status` identifies the assistant-question flow; it never implies that the assistant already sent its question.

The old `lexicon_apply_change_plan`, `lexicon_cancel_change_plan`, and widget-only `lexicon_confirm_change_plan` routes are retired. `lexicon_review_change_plan_native` remains a compatibility alias for the same assistant-question flow. Former `approvalUi`/`LEXICON_APPROVAL_UI` overrides are deprecated and ignored.

Scrolling away, hiding the chat, or remounting a preview does not apply or cancel a plan. A bounded widget-state snapshot can restore the view, filter, and disclosure state where supported. Without the user's answer the plan remains pending; there is no server-dialog dismissal to interpret as a decision.

Selections are resolved to explicit IDs while planning. Changing the selection later must not change the plan's targets. If relevant source data changes before application, create a new plan and review the updated preview.

## Outcomes and failure

Lexicon does not provide multi-request transactions. Application records per-operation outcomes and stops on failure by default. Inspect successful, failed, interrupted, and ambiguous items separately. Completed operations are not replayed by calling apply again.

Network failure after dispatch can leave a mutation's outcome unknown. The server does not blindly retry that operation. Read the current target in Lexicon and reconcile it against the saved before/after values before making another plan. A crashed process does not silently continue a pending write sequence.

Where supported, saved before-values can be used to propose compensating edits through a new reviewed plan. This is not a guarantee of full rollback. Deleted identities, external work started by a control command, and concurrent user changes may not be recoverable. Keep normal Lexicon backups, and test destructive workflows with a disposable library.

## Audit data

Plans, job reports, and rotating JSONL audit logs live outside the repository in the configured application-data directory. Audit entries record useful outcomes while excluding credentials. Before-values can include private metadata. Protect the directory, and do not commit it or attach it unredacted to an issue.
