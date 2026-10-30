import { expect, it, vi } from "vitest";
import { connected } from "./mcp-fixture.js";

const operations = [
  { tool: "lexicon_update_track", input: { id: 1, edits: { rating: 2 } } },
];

it.each([
  { inline: true, form: true },
  { inline: true, form: false },
  { inline: false, form: true },
  { inline: false, form: false },
])(
  "requests assistant-sent choices without server dialogs for %j",
  async ({ inline, form }) => {
    const f = await connected(inline, true, form, "native");
    const plan = await f.runtime.plans.create(operations);
    const issue = vi.spyOn(f.runtime.approvals, "issue");
    const dialog = vi.fn(async () => ({
      action: "accept" as const,
      content: { approve: true },
    }));
    if (form) f.client.setRequestHandler("elicitation/create", dialog);
    const status = await f.client.callTool({
      name: "lexicon_ui_status",
      arguments: {},
    });
    expect((status.structuredContent as any).result.mode).toBe(
      "assistant-question",
    );
    const descriptor = (await f.client.listTools()).tools.find(
      (tool) => tool.name === "lexicon_review_change_plan",
    )!;
    expect((descriptor._meta?.ui as any)?.resourceUri).toBeUndefined();
    expect(descriptor._meta?.["openai/outputTemplate"]).toBeUndefined();
    const response = await f.client.callTool({
      name: "lexicon_review_change_plan",
      arguments: { id: plan.id },
    });
    expect(response.isError).not.toBe(true);
    const result = (response.structuredContent as any).result;
    expect(result.status).toBe("pending");
    expect(result.review).toMatchObject({
      mode: "assistant-question",
      assistantMustAsk: true,
      serverDialogOpened: false,
      decisionTool: "lexicon_decide_change_plan",
    });
    expect(result.review.question.prompt).toBeTypeOf("string");
    const labels = result.review.question.options.map(
      (option: string | { label: string }) =>
        typeof option === "string" ? option : option.label,
    );
    expect(labels).toEqual(["Approve changes", "Cancel"]);
    expect(result.review.message).toContain("AskUserQuestion");
    expect(dialog).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
    expect(f.writes()).toBe(0);
    expect(response._meta?.["lexicon/approval"]).toBeUndefined();
    expect(response._meta?.["lexicon/preview"]).toBeUndefined();
    expect(
      (response.content as any[]).some((item) => item.type === "resource"),
    ).toBe(false);
  },
);

it("keeps read-only protection without sending any approval question", async () => {
  const f = await connected(true, true, true);
  Object.assign(f.runtime.config, { readOnly: true });
  const plan = await f.runtime.plans.create(operations);
  const dialog = vi.fn(async () => ({
    action: "accept" as const,
    content: { approve: true },
  }));
  f.client.setRequestHandler("elicitation/create", dialog);
  const response = await f.client.callTool({
    name: "lexicon_review_change_plan",
    arguments: { id: plan.id },
  });
  expect((response.structuredContent as any).result.review.mode).toBe(
    "read-only",
  );
  expect(
    (response.structuredContent as any).result.review.assistantMustAsk,
  ).not.toBe(true);
  expect(dialog).not.toHaveBeenCalled();
  expect(f.writes()).toBe(0);
});
