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
  const native = tool === "lexicon_review_change_plan_native";
  const opening = tool === "lexicon_review_change_plan" || native;
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
  else if (native && !capabilities.form)
    message =
      "This client does not advertise native MCP form dialogs. The saved plan remains pending. Use a client with working widget actions or native MCP forms; do not ask for chat approval or claim a dialog is visible.";
  else if (inspecting)
    message =
      "This inspects saved plan data only and does not prove any approval UI is open. If the user reports disabled Apply/Cancel or an IPC failure, use the advertised native fallback tool when available. Otherwise preserve the current preview and do not reopen it automatically.";
  else if (next)
    message =
      "Call lexicon_review_change_plan once to display this saved plan's approval UI, then wait. Do not ask for a chat reply.";
  else if (capabilities.inline)
    message =
      "An MCP widget was requested in the chat client; its visibility and working buttons are not verified by this server. Wait for the user's UI action. If the user reports disabled controls or IPC failure, call lexicon_review_change_plan_native when advertised. Do not refer to a separate dialog inside Lexicon.";
  else if (capabilities.form)
    message =
      "A native MCP approval form was requested in the chat client, not inside Lexicon. Wait for the user to submit it. Do not claim it is visible unless the host/user confirms, and do not reopen it automatically.";
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
    ...(capabilities.inline && capabilities.form && !native && !readOnly
      ? {
          fallbackTool: "lexicon_review_change_plan_native",
          fallbackWhen:
            "User reports disabled widget controls or unavailable IPC forwarding.",
        }
      : {}),
    approvalLocation: "MCP client UI, not a dialog in Lexicon DJ",
    uiVisibility: "not-verified-by-server",
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
