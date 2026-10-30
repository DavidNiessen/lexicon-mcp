import { expect, it } from "vitest";
import { planReview } from "../src/presentation.js";

it("routes planning through a read-only preview before native review", () => {
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
  expect(preview.message).toContain("read-only");
  const reviewed = planReview(
    "lexicon_review_change_plan",
    "pending",
    caps,
    false,
    false,
  )!;
  expect(reviewed.nextTool).toBeUndefined();
  expect(reviewed.mode).toBe("native-mcp-dialog");
  expect(reviewed.decisionTool).toBeUndefined();
});

it("does not infer a visible review from inspection", () => {
  const review = planReview(
    "lexicon_get_change_plan",
    "pending",
    { inline: true, form: true },
    false,
    false,
  )!;
  expect(review.inspectionOnly).toBe(true);
  expect(review.uiOpenedByThisCall).toBe(false);
  expect(review.nextTool).toBeUndefined();
  expect(review.message).toContain("this call opened no review UI");
});

it("requests explicit chat confirmation only after review on clients without native forms", () => {
  const caps = { inline: false, form: false };
  const planned = planReview(
    "lexicon_plan_changes",
    "pending",
    caps,
    false,
    false,
  )!;
  expect(planned.nextTool).toBe("lexicon_review_change_plan");
  expect(planned.chatConfirmationRequired).toBeUndefined();
  const reviewed = planReview(
    "lexicon_review_change_plan",
    "pending",
    caps,
    false,
    false,
  )!;
  expect(reviewed.mode).toBe("chat-confirmation");
  expect(reviewed.chatConfirmationRequired).toBe(true);
  expect(reviewed.decisionTool).toBe("lexicon_decide_change_plan");
  expect(reviewed.message).toContain("wait for their explicit reply");
});

it("never treats a dismissal or read-only state as chat approval", () => {
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
    expect(review.chatConfirmationRequired).toBeUndefined();
  }
});
