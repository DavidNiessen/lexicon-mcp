import { expect, it, vi } from "vitest";
import { connected } from "./mcp-fixture.js";

const operations = [
  { tool: "lexicon_update_track", input: { id: 1, edits: { rating: 2 } } },
];
const resultOf = (response: any) => response.structuredContent.result;
const decide = (
  f: Awaited<ReturnType<typeof connected>>,
  plan: { id: string; hash: string },
  decision = "apply",
  extra: Record<string, unknown> = {},
) =>
  f.client.callTool({
    name: "lexicon_decide_change_plan",
    arguments: {
      id: plan.id,
      hash: plan.hash,
      decision,
      confirmed: true,
      ...extra,
    },
  });

it("offers chat approval when native controls are unavailable, without applying during review", async () => {
  const f = await connected(true);
  const plan = await f.runtime.plans.create(operations);
  const issue = vi.spyOn(f.runtime.approvals, "issue");
  const response = await f.client.callTool({
    name: "lexicon_review_change_plan",
    arguments: { id: plan.id },
  });
  expect(response.isError).not.toBe(true);
  expect(resultOf(response).review).toMatchObject({
    mode: "chat-confirmation",
    chatConfirmationRequired: true,
    decisionTool: "lexicon_decide_change_plan",
  });
  expect(resultOf(response).review.message).toContain(
    "wait for their explicit reply",
  );
  expect(response._meta?.["lexicon/approval"]).toBeUndefined();
  expect(issue).not.toHaveBeenCalled();
  expect(f.writes()).toBe(0);
  const status = await f.client.callTool({
    name: "lexicon_ui_status",
    arguments: {},
  });
  expect(resultOf(status)).toMatchObject({
    mode: "chat-confirmation",
    chatApprovalTool: "lexicon_decide_change_plan",
  });
});

it("rejects chat decisions before review, without explicit confirmation, or for the wrong hash", async () => {
  const f = await connected();
  const plan = await f.runtime.plans.create(operations);
  expect((await decide(f, plan)).isError).toBe(true);
  await f.client.callTool({
    name: "lexicon_review_change_plan",
    arguments: { id: plan.id },
  });
  for (const confirmed of [undefined, false]) {
    expect((await decide(f, plan, "apply", { confirmed })).isError).toBe(true);
  }
  expect((await decide(f, { ...plan, hash: "b".repeat(64) })).isError).toBe(
    true,
  );
  expect((await f.runtime.plans.get(plan.id)).status).toBe("pending");
  expect(f.writes()).toBe(0);
});

it("applies a reviewed chat decision once across concurrent and repeated calls", async () => {
  const f = await connected();
  const plan = await f.runtime.plans.create(operations);
  await f.client.callTool({
    name: "lexicon_review_change_plan",
    arguments: { id: plan.id },
  });
  const issue = vi.spyOn(f.runtime.approvals, "issue");
  const responses = await Promise.all([decide(f, plan), decide(f, plan)]);
  for (const response of responses) {
    expect(response.isError).not.toBe(true);
    expect(resultOf(response).status).toBe("completed");
    expect(resultOf(response).outcomeCount).toBe(1);
    expect(response._meta?.["lexicon/approval"]).toBeUndefined();
  }
  expect((await decide(f, plan)).isError).not.toBe(true);
  expect((await decide(f, plan, "cancel")).isError).toBe(true);
  expect(f.writes()).toBe(1);
  expect(issue).toHaveBeenCalledOnce();
});

it("cancels only after an explicit reviewed chat decision and never writes the library", async () => {
  const f = await connected();
  const plan = await f.runtime.plans.create(operations);
  await f.client.callTool({
    name: "lexicon_review_change_plan",
    arguments: { id: plan.id },
  });
  const cancelled = await decide(f, plan, "cancel");
  expect(cancelled.isError).not.toBe(true);
  expect(resultOf(cancelled).status).toBe("cancelled");
  expect((await decide(f, plan, "cancel")).isError).not.toBe(true);
  expect((await decide(f, plan)).isError).toBe(true);
  expect(f.writes()).toBe(0);
});

it("rejects a chat decision after the reviewed plan hash changes", async () => {
  const f = await connected();
  const plan = await f.runtime.plans.create(operations);
  await f.client.callTool({
    name: "lexicon_review_change_plan",
    arguments: { id: plan.id },
  });
  await f.runtime.store.write(plan.id, { ...plan, hash: "c".repeat(64) });
  expect((await decide(f, plan)).isError).toBe(true);
  expect(f.writes()).toBe(0);
});

it("blocks chat approval in read-only mode", async () => {
  const f = await connected();
  const plan = await f.runtime.plans.create(operations);
  await f.client.callTool({
    name: "lexicon_review_change_plan",
    arguments: { id: plan.id },
  });
  Object.assign(f.runtime.config, { readOnly: true });
  expect((await decide(f, plan)).isError).toBe(true);
  expect(f.writes()).toBe(0);
});

it("does not let a client with native forms bypass native approval using chat decisions", async () => {
  const f = await connected(true, true, true);
  const plan = await f.runtime.plans.create(operations);
  const dialog = vi.fn(async () => ({ action: "cancel" as const }));
  f.client.setRequestHandler("elicitation/create", dialog);
  await f.client.callTool({
    name: "lexicon_review_change_plan",
    arguments: { id: plan.id },
  });
  const response = await decide(f, plan);
  expect(response.isError).toBe(true);
  expect(dialog).toHaveBeenCalledOnce();
  expect(f.writes()).toBe(0);
});

it("cannot bypass approval with 117 separate MCP single-track updates", async () => {
  const f = await connected();
  const request = vi.mocked(f.runtime.client.request);
  for (let id = 1; id <= 117; id++) {
    const response = await f.client.callTool({
      name: "lexicon_update_track",
      arguments: { id, edits: { tags: [183, 218] } },
    });
    expect(response.isError).not.toBe(true);
    expect(resultOf(response).plan.status).toBe("pending");
    expect(resultOf(response).plan.operationCount).toBe(1);
    expect(resultOf(response).plan.operations).toBeUndefined();
    expect(resultOf(response).review.nextTool).toBe(
      "lexicon_review_change_plan",
    );
  }
  expect(f.writes()).toBe(0);
  expect(request.mock.calls.every(([method]) => method === "GET")).toBe(true);
}, 15000);
