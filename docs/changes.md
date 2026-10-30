# Changes and recovery

## Review policy

Individual low-impact edits can execute directly. Bulk edits, deletions, file-reference changes, and destructive commands require an immutable persisted plan. Read-only mode can prohibit all writes.

`lexicon_plan_changes` validates proposed operations and captures exact targets and before-values. `lexicon_get_change_plan` inspects the saved plan as data; neither call creates a widget. Call `lexicon_review_change_plan` once to display its approval UI, then wait for the user to choose **Apply** or **Cancel**. Clients advertising MCP form elicitation can instead use the same review tool to open a native dialog. These are UI decisions: a message such as “yes” in chat cannot apply a plan. Closing or declining a native dialog, or submitting it with approval unchecked, leaves the plan pending; the assistant must wait until the user asks to reopen it. Native defaults are never interpreted as cancellation.

The legacy `lexicon_apply_change_plan` and `lexicon_cancel_change_plan` tools are no longer advertised and their runtime routes reject calls. The embedded UI uses the app-only `lexicon_confirm_change_plan` tool with an expiring credential bound to the exact plan and hash. Credentials appear only in UI-private tool metadata, never in model-visible content, initial HTML, or persisted widget state. Native dialogs use a signed continuation and require an accepted, checked approval field. Invalid, expired, stale, cancelled, or reused requests cannot replay writes. A trusted host mediates the UI; tool visibility metadata alone is not authentication.

Scrolling away, hiding the chat, remounting its iframe, or expiring a UI credential does not cancel a plan. Widget state restores a bounded presentation snapshot, filter, and disclosure setting where the host supports it; it never authorizes a write. Fresh server results supply approval credentials. If a credential expires, reopen the existing pending plan rather than creating a replacement automatically.

Use `lexicon_ui_status` to inspect the connected client's advertised capabilities. Embedded MCP Apps and native MCP forms are detected independently. When neither is available, or the server is read-only, applying is blocked. Text/JSON reports remain available, but there is no text-confirmation fallback.

If a rendered widget cannot forward its buttons, call the advertised `lexicon_review_change_plan_native` tool to request a native MCP form for the same saved plan. This route uses the ordinary MCP connection and the same signed plan-bound approval checks; it never depends on the iframe bridge, exposes approval credentials to the model, or creates another widget. A client must advertise form elicitation, and only an accepted, checked field approves the write. Pending plan data is not evidence that any review UI is currently visible.

Inspection results mark `inspectionOnly: true` and `uiOpenedByThisCall: false`. Supported routes are named in `openReviewTool` and, when available, `nativeReviewTool`; these are options for an explicit request to open review, not instructions to reopen automatically. Review guidance appears before track snapshots in both JSON text and structured results so bounded client output retains it. An assistant that only calls `lexicon_get_change_plan` has not requested an approval dialog.

Selections are resolved to explicit IDs while planning. Changing the selection later must not change the plan's targets. If relevant source data changes before application, create a new plan and review the updated preview.

## Outcomes and failure

Lexicon does not provide multi-request transactions. Application records per-operation outcomes and stops on failure by default. Inspect successful, failed, interrupted, and ambiguous items separately. Completed operations are not replayed by calling apply again.

Network failure after dispatch can leave a mutation's outcome unknown. The server does not blindly retry that operation. Read the current target in Lexicon and reconcile it against the saved before/after values before making another plan. A crashed process does not silently continue a pending write sequence.

Where supported, saved before-values can be used to propose compensating edits through a new reviewed plan. This is not a guarantee of full rollback. Deleted identities, external work started by a control command, and concurrent user changes may not be recoverable. Keep normal Lexicon backups, and test destructive workflows with a disposable library.

## Audit data

Plans, job reports, and rotating JSONL audit logs live outside the repository in the configured application-data directory. Audit entries record useful outcomes while excluding credentials. Before-values can include private metadata. Protect the directory, and do not commit it or attach it unredacted to an issue.
