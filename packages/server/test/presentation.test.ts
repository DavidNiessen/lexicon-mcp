import { expect, it } from "vitest";
import { planReview } from "../src/presentation.js";

it("separates a requested MCP widget from verified visibility and exposes a native fallback", () => {
  const capabilities = { inline: true, form: true };
  const planned = planReview(
    "lexicon_plan_changes",
    "pending",
    capabilities,
    false,
    false,
  )!;
  expect(planned.nextTool).toBe("lexicon_review_change_plan");
  const opened = planReview(
    "lexicon_review_change_plan",
    "pending",
    capabilities,
    false,
    false,
  )!;
  expect(opened.nextTool).toBeUndefined();
  expect(opened.uiVisibility).toBe("not-verified-by-server");
  expect(opened.approvalLocation).toBe(
    "MCP client UI, not a dialog in Lexicon DJ",
  );
  expect(opened.fallbackTool).toBe("lexicon_review_change_plan_native");
  expect(opened.message).toContain("working buttons are not verified");
});

it("does not infer an open dialog from saved pending plan data", () => {
  const review = planReview(
    "lexicon_get_change_plan",
    "pending",
    { inline: true, form: true },
    false,
    false,
  )!;
  expect(review.nextTool).toBeUndefined();
  expect(review.message).toContain("does not prove any approval UI is open");
  expect(review.fallbackTool).toBe("lexicon_review_change_plan_native");
});

it("describes the explicit native route without pointing to a Lexicon application dialog or another widget", () => {
  const review = planReview(
    "lexicon_review_change_plan_native",
    "pending",
    { inline: false, form: true },
    false,
    false,
  )!;
  expect(review.mode).toBe("native-mcp-dialog");
  expect(review.nextTool).toBeUndefined();
  expect(review.fallbackTool).toBeUndefined();
  expect(review.message).toContain("in the chat client, not inside Lexicon");
});

it("explains missing native forms without pretending a rendered widget has working controls", () => {
  const review = planReview(
    "lexicon_review_change_plan_native",
    "pending",
    { inline: false, form: false },
    false,
    false,
  )!;
  expect(review.mode).toBe("unavailable");
  expect(review.message).toContain(
    "does not advertise native MCP form dialogs",
  );
  expect(review.nextTool).toBeUndefined();
  expect(review.uiVisibility).toBe("not-verified-by-server");
});
