import { expect, it, vi } from "vitest";
import { connected } from "./mcp-fixture.js";
import { planReview } from "../src/presentation.js";

it("keeps inspection routing before large snapshots without opening UI or changing the saved plan", async () => {
  const f = await connected(true, true, true);
  const api = vi.mocked(f.runtime.client.request);
  api.mockResolvedValue({
    track: { id: 1, rating: 1, comment: "x".repeat(50_000) },
  } as any);
  const plan = await f.runtime.plans.create([
    { tool: "lexicon_update_track", input: { id: 1, edits: { rating: 2 } } },
  ]);
  const before = await f.runtime.plans.get(plan.id);
  const apiCalls = api.mock.calls.length;
  const dialog = vi.fn(async () => ({ action: "cancel" as const }));
  f.client.setRequestHandler("elicitation/create", dialog);
  const response = await f.client.callTool({
    name: "lexicon_get_change_plan",
    arguments: { id: plan.id },
  });
  const text = (response.content as any[]).find(
    (item) => item.type === "text",
  ).text;
  expect(text.length).toBeGreaterThan(50_000);
  expect(text.slice(0, 2000)).toContain('"uiOpenedByThisCall":false');
  expect(text.slice(0, 2000)).toContain(
    '"nativeReviewTool":"lexicon_review_change_plan_native"',
  );
  expect(text.slice(0, 2000)).toContain("this call opened no review UI");
  expect(JSON.parse(text).result).toEqual(
    (response.structuredContent as any).result,
  );
  expect(Object.keys(JSON.parse(text).result)[0]).toBe("review");
  expect(response._meta?.["lexicon/approval"]).toBeUndefined();
  expect(response._meta?.["lexicon/preview"]).toBeUndefined();
  expect(
    (response.content as any[]).some((item) => item.type === "resource"),
  ).toBe(false);
  expect(dialog).not.toHaveBeenCalled();
  expect(api).toHaveBeenCalledTimes(apiCalls);
  expect(f.writes()).toBe(0);
  expect(await f.runtime.plans.get(plan.id)).toEqual(before);
  const tool = (await f.client.listTools()).tools.find(
    (tool) => tool.name === "lexicon_get_change_plan",
  )!;
  expect(tool.description).toContain("does not open any approval UI");
});

it.each([
  { inline: true, form: false, readOnly: false, open: true, native: false },
  { inline: false, form: true, readOnly: false, open: true, native: true },
  { inline: false, form: false, readOnly: false, open: false, native: false },
  { inline: true, form: true, readOnly: true, open: false, native: false },
])(
  "provides conditional review routes without automatically reopening for %j",
  ({ inline, form, readOnly, open, native }) => {
    const review = planReview(
      "lexicon_get_change_plan",
      "pending",
      { inline, form },
      readOnly,
      false,
    )!;
    expect(review.inspectionOnly).toBe(true);
    expect(review.uiOpenedByThisCall).toBe(false);
    expect(review.nextTool).toBeUndefined();
    expect(review.openReviewTool).toBe(
      open ? "lexicon_review_change_plan" : undefined,
    );
    expect(review.nativeReviewTool).toBe(
      native ? "lexicon_review_change_plan_native" : undefined,
    );
  },
);
