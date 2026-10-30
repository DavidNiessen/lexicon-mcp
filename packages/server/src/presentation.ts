import { previewFor } from "./ui/model.js";

/** A preview renders data; approval is a separate assistant-sent chat question. */
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
  scope?: { id: string; operationCount: number },
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
  const count = scope?.operationCount;
  const prompt =
    count === undefined
      ? "Apply the changes shown in this saved plan's preview?"
      : `Apply the ${count} library ${count === 1 ? "change" : "changes"} shown in this saved plan's preview?`;
  let message: string;
  if (readOnly)
    message = "The server is read-only; applying changes is blocked.";
  else if (dismissed)
    message =
      "No answer was received. Leave the plan pending and wait; never infer approval or cancellation.";
  else if (inspecting)
    message =
      "Data-only inspection: this call opened no review UI and sent no approval question. Show the saved plan's preview when requested, then call lexicon_review_change_plan.";
  else if (next)
    message = `Call ${next} next. The preview is read-only and has no approval buttons.`;
  else
    message =
      "YOU must now send the approval question to the user using your OWN native question tool (Claude Code: AskUserQuestion), with Approve changes and Cancel choices. If that tool is unavailable, ask the question in plain chat. This MCP call opened NO dialog and sent NO question. Never tell the user to click the preview. Wait for their actual reply, then call lexicon_decide_change_plan with this reviewed ID/hash and their decision. A tool permission prompt, silence, or the original edit request is not approval.";
  return {
    mode: readOnly ? "read-only" : "assistant-question",
    serverDialogOpened: false,
    ...(next ? { nextTool: next } : {}),
    ...(inspecting
      ? {
          inspectionOnly: true,
          uiOpenedByThisCall: false,
          ...(!readOnly
            ? { openReviewTool: "lexicon_review_change_plan" }
            : {}),
        }
      : {}),
    ...(!readOnly && opening && !dismissed
      ? {
          assistantMustAsk: true,
          decisionTool: "lexicon_decide_change_plan",
          question: {
            header: "Library edits",
            prompt,
            ...(scope ? { planId: scope.id } : {}),
            options: [
              {
                label: "Approve changes",
                description: "Apply every change in this exact saved plan.",
                decision: "apply",
              },
              {
                label: "Cancel",
                description: "Cancel this plan without changing the library.",
                decision: "cancel",
              },
            ],
          },
        }
      : {}),
    approvalLocation:
      "A question sent by the assistant in chat, never the preview",
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
      "Change proposals must become saved plans and use lexicon_preview_change_plan; reports cannot approve changes.",
    );
  const preview = previewFor(report);
  if (preview?.plan)
    throw new Error("Report previews cannot authorize change plans.");
  if (!preview) throw new Error("This report has no supported visual preview.");
  return preview;
}
