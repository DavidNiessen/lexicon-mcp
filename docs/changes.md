# Changes and recovery

## Review policy

Individual low-impact edits can execute directly. Bulk edits, deletions, file-reference changes, and destructive commands require an immutable persisted plan. Read-only mode can prohibit all writes.

`lexicon_plan_changes` validates proposed operations and captures exact targets and before-values. `lexicon_get_change_plan` returns the preview. The assistant presents it, gets confirmation in chat, and then calls `lexicon_apply_change_plan` with the plan ID and content hash. `lexicon_cancel_change_plan` cancels an unapplied plan.

The server cannot prove that a human approved a conversation. These tools prevent accidental implicit bulk execution and stale changes; use a trusted MCP client for user confirmation. Tool annotations are descriptive, not an authorization boundary.

Selections are resolved to explicit IDs while planning. Changing the selection later must not change the plan's targets. If relevant source data changes before application, create a new plan and review the updated preview.

## Outcomes and failure

Lexicon does not provide multi-request transactions. Application records per-operation outcomes and stops on failure by default. Inspect successful, failed, interrupted, and ambiguous items separately. Completed operations are not replayed by calling apply again.

Network failure after dispatch can leave a mutation's outcome unknown. The server does not blindly retry that operation. Read the current target in Lexicon and reconcile it against the saved before/after values before making another plan. A crashed process does not silently continue a pending write sequence.

Where supported, saved before-values can be used to propose compensating edits through a new reviewed plan. This is not a guarantee of full rollback. Deleted identities, external work started by a control command, and concurrent user changes may not be recoverable. Keep normal Lexicon backups, and test destructive workflows with a disposable library.

## Audit data

Plans, job reports, and rotating JSONL audit logs live outside the repository in the configured application-data directory. Audit entries record useful outcomes while excluding credentials. Before-values can include private metadata. Protect the directory, and do not commit it or attach it unredacted to an issue.
