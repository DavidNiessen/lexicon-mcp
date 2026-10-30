import { expect, it, vi } from "vitest";
import { connected } from "./mcp-fixture.js";

const nativeTool = "lexicon_review_change_plan_native";
const operations = [
  { tool: "lexicon_update_track", input: { id: 1, edits: { rating: 2 } } },
];

it("advertises a native-only fallback without linking another widget", async () => {
  const f = await connected(true, true, true);
  const status = await f.client.callTool({
    name: "lexicon_ui_status",
    arguments: {},
  });
  expect((status.structuredContent as any).result).toMatchObject({
    inline: true,
    form: true,
    nativeReviewTool: nativeTool,
  });
  const tool = (await f.client.listTools()).tools.find(
    (tool) => tool.name === nativeTool,
  )!;
  expect(tool).toBeDefined();
  expect((tool._meta?.ui as any)?.resourceUri).toBeUndefined();
  expect(tool._meta?.["openai/outputTemplate"]).toBeUndefined();
  expect(tool.annotations?.readOnlyHint).toBe(false);
  expect(f.writes()).toBe(0);
});

it("opens a real native form even when embedded Apps are advertised, and applies only checked approval", async () => {
  const f = await connected(true, true, true);
  const issue = vi.spyOn(f.runtime.approvals, "issue");
  const plan = await f.runtime.plans.create(operations);
  const dialog = vi.fn(async () => ({
    action: "accept" as const,
    content: { approve: true },
  }));
  f.client.setRequestHandler("elicitation/create", dialog);
  const response = await f.client.callTool({
    name: nativeTool,
    arguments: { id: plan.id },
  });
  expect(response.isError).not.toBe(true);
  expect(dialog).toHaveBeenCalledOnce();
  expect(f.writes()).toBe(1);
  expect(issue).toHaveBeenCalledOnce();
  expect((response.structuredContent as any).result.status).toBe("completed");
  expect(response._meta?.["lexicon/approval"]).toBeUndefined();
  expect(response._meta?.["lexicon/preview"]).toBeUndefined();
  expect(
    (response.content as any[]).some((item) => item.type === "resource"),
  ).toBe(false);
  const token =
    issue.mock.results[0]?.value && (await issue.mock.results[0].value).token;
  expect(JSON.stringify(response)).not.toContain(token);
  const completed = await f.client.callTool({
    name: nativeTool,
    arguments: { id: plan.id },
  });
  expect((completed.structuredContent as any).result.status).toBe("completed");
  expect(dialog).toHaveBeenCalledOnce();
  expect(f.writes()).toBe(1);
});

it.each([
  { action: "cancel" },
  { action: "decline" },
  { action: "accept", content: { approve: false } },
] as const)(
  "keeps a native fallback pending without grants or writes for %j",
  async (answer) => {
    const f = await connected(true, true, true);
    const issue = vi.spyOn(f.runtime.approvals, "issue");
    const plan = await f.runtime.plans.create(operations);
    const dialog = vi.fn(async () => answer);
    f.client.setRequestHandler("elicitation/create", dialog);
    const response = await f.client.callTool({
      name: nativeTool,
      arguments: { id: plan.id },
    });
    expect(response.isError).not.toBe(true);
    const result = (response.structuredContent as any).result;
    expect(result.status).toBe("pending");
    expect(result.review).toMatchObject({
      mode: "native-mcp-dialog",
      dismissed: true,
    });
    expect(result.review.nextTool).toBeUndefined();
    expect(dialog).toHaveBeenCalledOnce();
    expect(issue).not.toHaveBeenCalled();
    expect(f.writes()).toBe(0);
    expect(response._meta?.["lexicon/approval"]).toBeUndefined();
    expect(response._meta?.["lexicon/preview"]).toBeUndefined();
    expect(
      (response.content as any[]).some((item) => item.type === "resource"),
    ).toBe(false);
    expect((await f.runtime.plans.get(plan.id)).status).toBe("pending");
  },
);

it("fails closed when only widgets are advertised and native forms are unavailable", async () => {
  const f = await connected(true, true, false);
  const issue = vi.spyOn(f.runtime.approvals, "issue");
  const plan = await f.runtime.plans.create(operations);
  const status = await f.client.callTool({
    name: "lexicon_ui_status",
    arguments: {},
  });
  expect(
    (status.structuredContent as any).result.nativeReviewTool,
  ).toBeUndefined();
  const response = await f.client.callTool({
    name: nativeTool,
    arguments: { id: plan.id },
  });
  expect(response.isError).not.toBe(true);
  expect((response.structuredContent as any).result.review.mode).toBe(
    "unavailable",
  );
  expect((response.structuredContent as any).result.status).toBe("pending");
  expect(issue).not.toHaveBeenCalled();
  expect(f.writes()).toBe(0);
  expect(response._meta?.["lexicon/approval"]).toBeUndefined();
  expect(response._meta?.["lexicon/preview"]).toBeUndefined();
  expect(
    (response.content as any[]).some((item) => item.type === "resource"),
  ).toBe(false);
});

it("preserves read-only policy for the native fallback", async () => {
  const f = await connected(true, true, true);
  Object.assign(f.runtime.config, { readOnly: true });
  const issue = vi.spyOn(f.runtime.approvals, "issue");
  const dialog = vi.fn(async () => ({
    action: "accept" as const,
    content: { approve: true },
  }));
  f.client.setRequestHandler("elicitation/create", dialog);
  const plan = await f.runtime.plans.create(operations);
  const response = await f.client.callTool({
    name: nativeTool,
    arguments: { id: plan.id },
  });
  expect((response.structuredContent as any).result.review.mode).toBe(
    "read-only",
  );
  expect(dialog).not.toHaveBeenCalled();
  expect(issue).not.toHaveBeenCalled();
  expect(f.writes()).toBe(0);
});
