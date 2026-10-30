import { expect, it, vi } from "vitest";
import { connected } from "./mcp-fixture.js";

const alias = "lexicon_review_change_plan_native";
const operations = [
  { tool: "lexicon_update_track", input: { id: 1, edits: { rating: 2 } } },
];

it.each([true, false])(
  "keeps the legacy native-named alias as assistant-question review with form capability %j",
  async (form) => {
    const f = await connected(true, true, form);
    const plan = await f.runtime.plans.create(operations);
    const dialog = vi.fn(async () => ({
      action: "accept" as const,
      content: { approve: true },
    }));
    if (form) f.client.setRequestHandler("elicitation/create", dialog);
    const descriptor = (await f.client.listTools()).tools.find(
      (tool) => tool.name === alias,
    )!;
    expect(descriptor).toBeDefined();
    expect((descriptor._meta?.ui as any)?.resourceUri).toBeUndefined();
    const response = await f.client.callTool({
      name: alias,
      arguments: { id: plan.id },
    });
    expect(response.isError).not.toBe(true);
    expect((response.structuredContent as any).result.review).toMatchObject({
      mode: "assistant-question",
      assistantMustAsk: true,
      serverDialogOpened: false,
    });
    expect(dialog).not.toHaveBeenCalled();
    expect(f.writes()).toBe(0);
    const approved = await f.client.callTool({
      name: "lexicon_decide_change_plan",
      arguments: {
        id: plan.id,
        hash: plan.hash,
        decision: "apply",
        confirmed: true,
      },
    });
    expect(approved.isError).not.toBe(true);
    expect((approved.structuredContent as any).result.status).toBe("completed");
    expect(f.writes()).toBe(1);
    const completed = await f.client.callTool({
      name: alias,
      arguments: { id: plan.id },
    });
    expect((completed.structuredContent as any).result.status).toBe(
      "completed",
    );
    expect((completed.structuredContent as any).result.review).toBeUndefined();
    expect(dialog).not.toHaveBeenCalled();
    expect(f.writes()).toBe(1);
  },
);
