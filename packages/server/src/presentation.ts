import { previewFor } from "./ui/model.js";

/** Only these read-only results or explicit display tools create a widget. */
export const renderTools = new Set([
  "lexicon_preview_change_plan",
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
  const previewing = tool === "lexicon_preview_change_plan";
  const opening =
    tool === "lexicon_review_change_plan" ||
    tool === "lexicon_review_change_plan_native";
  const next =
    !dismissed && !readOnly && !inspecting && !opening
      ? previewing || !capabilities.inline
        ? "lexicon_review_change_plan"
        : "lexicon_preview_change_plan"
      : undefined;
  let message: string;
  if (dismissed)
    message =
      "Approval was not granted. The plan is still pending; no changes were applied. Do not cancel it or reopen the dialog automatically. Wait for the user to request another review.";
  else if (readOnly)
    message = "The server is in read-only mode; applying changes is blocked.";
  else if (inspecting)
    message =
      "Data-only inspection: this call opened no review UI. Show the saved plan's read-only preview when requested, then use lexicon_review_change_plan for native client approval or chat confirmation. Do not infer a visible dialog from pending status or reopen automatically.";
  else if (next)
    message = `Call ${next} next. The preview is read-only; approval happens separately in the chat client.`;
  else if (capabilities.form)
    message =
      "A native approval form was requested in the chat client. Wait for the user's decision. Do not claim it is visible unless confirmed, or reopen a dismissed form automatically.";
  else
    message =
      "Native approval controls are unavailable. Summarize this exact saved plan, ask the user to approve or cancel it in chat, and wait for their explicit reply. Only then relay their decision with lexicon_decide_change_plan, the reviewed ID/hash and confirmed=true. Never infer consent or treat the original edit request as approval.";
  return {
    mode: readOnly
      ? "read-only"
      : capabilities.form
        ? "native-mcp-dialog"
        : "chat-confirmation",
    ...(dismissed ? { dismissed: true } : next ? { nextTool: next } : {}),
    ...(inspecting
      ? {
          inspectionOnly: true,
          uiOpenedByThisCall: false,
          ...(!readOnly
            ? {
                openReviewTool: "lexicon_review_change_plan",
                ...(capabilities.form
                  ? { nativeReviewTool: "lexicon_review_change_plan_native" }
                  : {}),
              }
            : {}),
        }
      : {}),
    ...(!readOnly && !capabilities.form && opening && !dismissed
      ? {
          chatConfirmationRequired: true,
          decisionTool: "lexicon_decide_change_plan",
        }
      : {}),
    approvalLocation:
      "Native chat-client controls, or explicit chat confirmation if unavailable",
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
