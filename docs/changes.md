# Changes and recovery

## Review policy

All persistent library mutations require an immutable saved plan and explicit approval, including edits to one track. Individual calls cannot be used to bypass review of a bulk task. Prepare one plan for the task whenever possible. Explicitly safe playback/navigation controls can remain immediate; read-only mode prohibits writes.

`lexicon_plan_changes` validates proposed operations and captures exact targets and before-values. Plan creation and `lexicon_get_change_plan` return compact, bounded text summaries rather than full before snapshots or operation payloads. Inspection supports `offset` and `limit` for bounded detail pages. The full plan remains saved locally and is used for validation and application.

Call `lexicon_preview_change_plan` to show the saved plan in a read-only widget. It has no approval controls, write credentials, or tool-call bridge. Planning and inspection do not create widgets. A preview is presentation, not approval.

Then call `lexicon_review_change_plan` with the default `approval: "auto"`. If the client advertises native MCP forms, the server requests a native form with the exact plan summary and an approval checkbox. Only accepted, checked approval applies it. Closing, declining, or submitting an unchecked form leaves the plan pending and never switches to chat automatically.

If the client does not advertise native forms, review opens a chat-confirmation marker for the exact plan ID/hash, valid for 10 minutes. The assistant may also deliberately request `approval: "chat"` when the user reports missing/broken native controls or explicitly asks for chat approval, even if forms are advertised. That request opens review only; it does not approve the plan.

The assistant presents the proposed changes and asks the user to approve or cancel. After the user's explicit reply, it calls `lexicon_decide_change_plan` with `id`, `hash`, `decision: "apply" | "cancel"`, and `confirmed: true`. A client advertising native forms still needs this prior chat-specific review before a chat decision is accepted. Missing/expired reviews, changed hashes, read-only mode, stale source data, and unsafe replays are rejected. A completed duplicate returns the recorded outcome without another write.

The server cannot read the chat transcript or prove who authored a relayed reply. The assistant must faithfully relay actual user consent and must never invent it, infer it from silence, or interpret a request to open the preview as approval. Internal approval credentials stay private. `lexicon_ui_status` reports the connected client's advertised capabilities and selected review path.

The old `lexicon_apply_change_plan`, `lexicon_cancel_change_plan`, and widget-only `lexicon_confirm_change_plan` routes are retired. `lexicon_review_change_plan_native` remains a compatibility alias for the supported native path. Former `approvalUi`/`LEXICON_APPROVAL_UI` overrides are deprecated and ignored. The client's form capability selects the default path; the deliberate per-review chat option handles unavailable native controls.

Scrolling away, hiding the chat, or remounting a preview does not apply or cancel a plan. A bounded widget-state snapshot can restore the view, filter, and disclosure state where supported. Pending status does not prove that a native form is visible. The assistant must wait after requesting review and reopen it only on the user's request.

Selections are resolved to explicit IDs while planning. Changing the selection later must not change the plan's targets. If relevant source data changes before application, create a new plan and review the updated preview.

## Outcomes and failure

Lexicon does not provide multi-request transactions. Application records per-operation outcomes and stops on failure by default. Inspect successful, failed, interrupted, and ambiguous items separately. Completed operations are not replayed by calling apply again.

Network failure after dispatch can leave a mutation's outcome unknown. The server does not blindly retry that operation. Read the current target in Lexicon and reconcile it against the saved before/after values before making another plan. A crashed process does not silently continue a pending write sequence.

Where supported, saved before-values can be used to propose compensating edits through a new reviewed plan. This is not a guarantee of full rollback. Deleted identities, external work started by a control command, and concurrent user changes may not be recoverable. Keep normal Lexicon backups, and test destructive workflows with a disposable library.

## Audit data

Plans, job reports, and rotating JSONL audit logs live outside the repository in the configured application-data directory. Audit entries record useful outcomes while excluding credentials. Before-values can include private metadata. Protect the directory, and do not commit it or attach it unredacted to an issue.
