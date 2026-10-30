import { expect, it, vi } from "vitest";
import { connected } from "./mcp-fixture.js";

const toolName = "lexicon_review_change_plan";
const operations = [
  { tool: "lexicon_update_track", input: { id: 1, edits: { rating: 2 } } },
];

it.each([
  { action: "accept", content: { approve: true }, completed: true },
  { action: "accept", content: { approve: false }, completed: false },
  { action: "cancel", completed: false },
  { action: "decline", completed: false },
] as const)(
  "automatically uses a single native form in the Claude profile for %j",
  async ({ completed, ...answer }) => {
    const f = await connected(true, true, true, "native");
    const plan = await f.runtime.plans.create(operations);
    const issue = vi.spyOn(f.runtime.approvals, "issue");
    const dialog = vi.fn(async () => answer);
    f.client.setRequestHandler("elicitation/create", dialog);
    const status = await f.client.callTool({
      name: "lexicon_ui_status",
      arguments: {},
    });
    expect((status.structuredContent as any).result).toMatchObject({
      inline: true,
      form: true,
      approvalUi: "native",
      mode: "native-mcp-dialog",
    });
    const planned = await f.client.callTool({
      name: "lexicon_get_change_plan",
      arguments: { id: plan.id },
    });
    expect((planned.structuredContent as any).result.review.mode).toBe(
      "native-mcp-dialog",
    );
    expect(dialog).not.toHaveBeenCalled();
    const descriptor = (await f.client.listTools()).tools.find(
      (tool) => tool.name === toolName,
    )!;
    expect((descriptor._meta?.ui as any)?.resourceUri).toBeUndefined();
    expect(descriptor._meta?.["openai/outputTemplate"]).toBeUndefined();
    const response = await f.client.callTool({
      name: toolName,
      arguments: { id: plan.id },
    });
    expect(response.isError).not.toBe(true);
    expect(dialog).toHaveBeenCalledOnce();
    expect(f.writes()).toBe(completed ? 1 : 0);
    expect(issue).toHaveBeenCalledTimes(completed ? 1 : 0);
    expect((response.structuredContent as any).result.status).toBe(
      completed ? "completed" : "pending",
    );
    expect(response._meta?.["lexicon/approval"]).toBeUndefined();
    expect(response._meta?.["lexicon/preview"]).toBeUndefined();
    expect(
      (response.content as any[]).some((item) => item.type === "resource"),
    ).toBe(false);
    if (completed) {
      const replay = await f.client.callTool({
        name: toolName,
        arguments: { id: plan.id },
      });
      expect((replay.structuredContent as any).result.status).toBe("completed");
      expect(dialog).toHaveBeenCalledOnce();
      expect(f.writes()).toBe(1);
    } else {
      expect(
        (response.structuredContent as any).result.review.nextTool,
      ).toBeUndefined();
    }
  },
);

it("blocks the Claude profile when native forms are unavailable instead of rendering dead buttons", async () => {
  const f = await connected(true, true, false, "native");
  const plan = await f.runtime.plans.create(operations);
  const issue = vi.spyOn(f.runtime.approvals, "issue");
  const response = await f.client.callTool({
    name: toolName,
    arguments: { id: plan.id },
  });
  const result = (response.structuredContent as any).result;
  expect(result.review.mode).toBe("unavailable");
  expect(result.review.message).toContain(
    "does not advertise native MCP form dialogs",
  );
  expect(result.status).toBe("pending");
  expect(issue).not.toHaveBeenCalled();
  expect(f.writes()).toBe(0);
  expect(response._meta?.["lexicon/preview"]).toBeUndefined();
  expect(
    (response.content as any[]).some((item) => item.type === "resource"),
  ).toBe(false);
});

it("keeps read-only protection when automatic native approval is selected", async () => {
  const f = await connected(true, true, true, "native");
  Object.assign(f.runtime.config, { readOnly: true });
  const plan = await f.runtime.plans.create(operations);
  const dialog = vi.fn(async () => ({
    action: "accept" as const,
    content: { approve: true },
  }));
  f.client.setRequestHandler("elicitation/create", dialog);
  const response = await f.client.callTool({
    name: toolName,
    arguments: { id: plan.id },
  });
  expect((response.structuredContent as any).result.review.mode).toBe(
    "read-only",
  );
  expect(dialog).not.toHaveBeenCalled();
  expect(f.writes()).toBe(0);
});
