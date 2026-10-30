import { previewFor } from "./ui/model.js";

/** Only these read-only results or explicit display tools create a widget. */
export const renderTools = new Set([
  "lexicon_review_change_plan",
  "lexicon_show_report",
  "lexicon_library_health",
  "lexicon_find_duplicates",
  "lexicon_prepare_set",
]);

export function planReview(
  tool: string,
  status: string | undefined,
  capabilities: { inline: boolean; form: boolean },
  readOnly: boolean,
  dismissed: boolean,
) {
  if (status !== "pending") return undefined;
  const inspecting = tool === "lexicon_get_change_plan";
  const opening = tool === "lexicon_review_change_plan";
  const next =
    !dismissed &&
    !readOnly &&
    !inspecting &&
    !opening &&
    (capabilities.inline || capabilities.form);
  let message: string;
  if (dismissed)
    message =
      "Approval was not granted. The plan is still pending; no changes were applied. Do not cancel it or reopen the dialog automatically. Wait for the user to request another review.";
  else if (readOnly)
    message = "The server is in read-only mode; applying changes is blocked.";
  else if (inspecting)
    message =
      "This is a data-only inspection. Preserve the existing preview. Only call lexicon_review_change_plan again if the user asks to reopen it.";
  else if (next)
    message =
      "Call lexicon_review_change_plan once to display this saved plan's approval UI, then wait. Do not ask for a chat reply.";
  else if (capabilities.inline)
    message =
      "Use Apply or Cancel in this preview. Wait for the user's UI action; do not call get/review again unless the user asks.";
  else if (capabilities.form)
    message =
      "Wait for the native MCP approval dialog. Do not reopen it automatically.";
  else
    message =
      "This client has not advertised an MCP Apps renderer or form elicitation. Applying changes is blocked; reconnect with a UI-capable client.";
  return {
    mode: readOnly
      ? "read-only"
      : capabilities.inline
        ? "embedded-preview"
        : capabilities.form
          ? "native-mcp-dialog"
          : "unavailable",
    ...(dismissed
      ? { dismissed: true }
      : next
        ? { nextTool: "lexicon_review_change_plan" }
        : {}),
    message,
  };
}

export function reportPreview(report: Record<string, unknown>) {
  let visited = 0;
  function planLike(value: unknown, depth = 0): boolean {
    if (!value || typeof value !== "object") return false;
    if (depth > 20 || ++visited > 10000)
      throw new Error("Report nesting or size exceeds the preview limit.");
    const data = value as Record<string, unknown>;
    if (Array.isArray(data.operations) || data.plan) return true;
    return Object.values(data).some((entry) => planLike(entry, depth + 1));
  }
  if (planLike(report))
    throw new Error(
      "Change proposals must become saved plans and use lexicon_review_change_plan; report previews cannot approve changes.",
    );
  const preview = previewFor(report);
  if (preview?.plan)
    throw new Error("Report previews cannot authorize change plans.");
  if (!preview) throw new Error("This report has no supported visual preview.");
  return preview;
}
