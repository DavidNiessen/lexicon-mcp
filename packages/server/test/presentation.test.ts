import { expect, it } from "vitest";
import { planReview } from "../src/presentation.js";

it("routes planning through a read-only preview before preparing an assistant-sent question", () => {
  const caps = { inline: true, form: true };
  expect(
    planReview("lexicon_plan_changes", "pending", caps, false, false)?.nextTool,
  ).toBe("lexicon_preview_change_plan");
  const preview = planReview(
    "lexicon_preview_change_plan",
    "pending",
    caps,
    false,
    false,
  )!;
  expect(preview.nextTool).toBe("lexicon_review_change_plan");
  expect(preview.assistantMustAsk).toBeUndefined();
  const reviewed = planReview(
    "lexicon_review_change_plan",
    "pending",
    caps,
    false,
    false,
    { id: "test-plan", operationCount: 117 },
  )!;
  expect(reviewed.mode).toBe("assistant-question");
  expect(reviewed.nextTool).toBeUndefined();
  expect(reviewed.serverDialogOpened).toBe(false);
  expect(reviewed.assistantMustAsk).toBe(true);
  expect(reviewed.question?.prompt).toContain("117 library changes");
  expect(reviewed.question?.options.map((option) => option.label)).toEqual([
    "Approve changes",
    "Cancel",
  ]);
  expect(reviewed.message).toContain("AskUserQuestion");
  expect(reviewed.message).toContain("opened NO dialog");
});

it("does not infer an approval question from inspection", () => {
  const review = planReview(
    "lexicon_get_change_plan",
    "pending",
    { inline: true, form: true },
    false,
    false,
  )!;
  expect(review.inspectionOnly).toBe(true);
  expect(review.uiOpenedByThisCall).toBe(false);
  expect(review.assistantMustAsk).toBeUndefined();
  expect(review.nextTool).toBeUndefined();
  expect(review.message).toContain("sent no approval question");
});

it.each([false, true])(
  "requires the assistant's own question regardless of advertised MCP forms (%s)",
  (form) => {
    const reviewed = planReview(
      "lexicon_review_change_plan",
      "pending",
      { inline: true, form },
      false,
      false,
    )!;
    expect(reviewed.mode).toBe("assistant-question");
    expect(reviewed.assistantMustAsk).toBe(true);
    expect(reviewed.serverDialogOpened).toBe(false);
    expect(reviewed.decisionTool).toBe("lexicon_decide_change_plan");
    expect(reviewed.message).toContain("plain chat");
    expect(reviewed.message).toContain("Wait for their actual reply");
  },
);

it("never treats a missing answer or read-only state as approval", () => {
  for (const [readOnly, dismissed] of [
    [false, true],
    [true, false],
  ]) {
    const review = planReview(
      "lexicon_review_change_plan",
      "pending",
      { inline: true, form: false },
      readOnly!,
      dismissed!,
    )!;
    expect(review.nextTool).toBeUndefined();
    expect(review.decisionTool).toBeUndefined();
    expect(review.assistantMustAsk).toBeUndefined();
  }
});
