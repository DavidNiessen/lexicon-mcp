import { expect, it, vi } from "vitest";
import { connected } from "./mcp-fixture.js";

it("renders one widget for plan, inspect, review and requires a private credential only from review", async () => {
  const f = await connected(true);
  const response = await f.client.callTool({
    name: "lexicon_plan_changes",
    arguments: {
      operations: [
        {
          tool: "lexicon_update_track",
          input: { id: 1, edits: { rating: 2 } },
        },
      ],
    },
  });
  expect(response.isError).not.toBe(true);
  const plan = (response.structuredContent as any).result;
  expect(plan.review.nextTool).toBe("lexicon_review_change_plan");
  const inspected = await f.client.callTool({
    name: "lexicon_get_change_plan",
    arguments: { id: plan.id },
  });
  const reviewed = await f.client.callTool({
    name: "lexicon_review_change_plan",
    arguments: { id: plan.id },
  });
  const stages = [response, inspected, reviewed];
  expect(
    stages
      .flatMap((stage) => stage.content as any[])
      .filter((item) => item.type === "resource"),
  ).toHaveLength(1);
  expect(response._meta?.["lexicon/preview"]).toBeUndefined();
  expect(response._meta?.["lexicon/approval"]).toBeUndefined();
  expect(inspected._meta?.["lexicon/preview"]).toBeUndefined();
  expect(inspected._meta?.["lexicon/approval"]).toBeUndefined();
  expect(
    (inspected.structuredContent as any).result.review.nextTool,
  ).toBeUndefined();
  expect(
    (reviewed.structuredContent as any).result.review.nextTool,
  ).toBeUndefined();
  const grant = (reviewed._meta as any)?.["lexicon/approval"];
  expect(grant?.token).toHaveLength(64);
  expect(
    JSON.stringify(
      stages.map((stage) => [stage.content, stage.structuredContent]),
    ),
  ).not.toContain(grant.token);
  const tools = await f.client.listTools();
  const flowTools = [
    "lexicon_plan_changes",
    "lexicon_get_change_plan",
    "lexicon_review_change_plan",
  ].map((name) => tools.tools.find((tool) => tool.name === name)!);
  expect(
    flowTools.filter((tool) => (tool._meta?.ui as any)?.resourceUri),
  ).toHaveLength(1);
  for (const tool of flowTools.slice(0, 2)) {
    expect(tool._meta?.["openai/outputTemplate"]).toBeUndefined();
    expect((tool._meta?.ui as any)?.resourceUri).toBeUndefined();
  }
  expect(
    (
      tools.tools.find((tool) => tool.name === "lexicon_update_track")?._meta
        ?.ui as any
    )?.resourceUri,
  ).toBeUndefined();
  expect(tools.tools.some((t) => t.name === "lexicon_apply_change_plan")).toBe(
    false,
  );
  expect(
    tools.tools.find((t) => t.name === "lexicon_confirm_change_plan")?._meta,
  ).toMatchObject({ ui: { visibility: ["app"] } });
  const confirmMeta = tools.tools.find(
    (t) => t.name === "lexicon_confirm_change_plan",
  )?._meta;
  expect((confirmMeta?.ui as any)?.resourceUri).toBeUndefined();
  expect(confirmMeta?.["openai/outputTemplate"]).toBeUndefined();
  expect(tools.tools.some((t) => t.name === "lexicon_cancel_change_plan")).toBe(
    false,
  );
  const afterOpening = await f.client.callTool({
    name: "lexicon_get_change_plan",
    arguments: { id: plan.id },
  });
  expect(afterOpening._meta?.["lexicon/approval"]).toBeUndefined();
  expect(
    (afterOpening.content as any[]).some((item) => item.type === "resource"),
  ).toBe(false);
  const rejected = await f.client.callTool({
    name: "lexicon_confirm_change_plan",
    arguments: {
      ...grant,
      expiresAt: undefined,
      token: "b".repeat(64),
      decision: "apply",
    },
  });
  expect(rejected.isError).toBe(true);
  expect(f.writes()).toBe(0);
  const approved = await f.client.callTool({
    name: "lexicon_confirm_change_plan",
    arguments: {
      id: grant.id,
      hash: grant.hash,
      token: grant.token,
      decision: "apply",
    },
  });
  expect(approved.isError).not.toBe(true);
  expect(
    (approved.content as any[]).some((item) => item.type === "resource"),
  ).toBe(false);
  expect((approved.structuredContent as any).result.status).toBe("completed");
  expect(f.writes()).toBe(1);
  await f.client.callTool({
    name: "lexicon_confirm_change_plan",
    arguments: {
      id: grant.id,
      hash: grant.hash,
      token: grant.token,
      decision: "apply",
    },
  });
  expect(f.writes()).toBe(1);
});

it("keeps protected mutation planning data-only until its explicit review", async () => {
  const f = await connected(true);
  const pending = await f.client.callTool({
    name: "lexicon_delete_tracks",
    arguments: { ids: [1] },
  });
  expect(pending.isError).not.toBe(true);
  expect((pending.structuredContent as any).result.plan.status).toBe("pending");
  expect((pending.structuredContent as any).result.review.nextTool).toBe(
    "lexicon_review_change_plan",
  );
  expect(pending._meta?.["lexicon/preview"]).toBeUndefined();
  expect(pending._meta?.["lexicon/approval"]).toBeUndefined();
  expect(
    (pending.content as any[]).some((item) => item.type === "resource"),
  ).toBe(false);
  expect(f.writes()).toBe(0);
});

it("renders read-only mixed workflow reports without issuing approval or accepting plan-shaped data", async () => {
  const f = await connected(true);
  const call = vi.spyOn(f.runtime, "call");
  const issue = vi.spyOn(f.runtime.approvals, "issue");
  const report = {
    memberships: [{ trackId: 1, playlistIds: [2, 3] }],
    playlists: [2, 3],
    commonTrackIds: [1],
  };
  const rendered = await f.client.callTool({
    name: "lexicon_show_report",
    arguments: { report },
  });
  expect(rendered.isError).not.toBe(true);
  expect(rendered.structuredContent).toEqual({ result: { report } });
  expect((rendered._meta?.["lexicon/preview"] as any).title).toBe(
    "Compare playlist membership",
  );
  expect(
    (rendered.content as any[]).filter((item) => item.type === "resource"),
  ).toHaveLength(1);
  expect(rendered._meta?.["lexicon/approval"]).toBeUndefined();
  expect(rendered._meta?.["lexicon/review"]).toBeUndefined();
  for (const proposed of [
    { operations: [] },
    { plan: { operations: [] } },
    { result: { operations: [] } },
    { ...report, extra: { operations: [] } },
  ]) {
    const rejected = await f.client.callTool({
      name: "lexicon_show_report",
      arguments: { report: proposed },
    });
    expect(rejected.isError).toBe(true);
    expect(rejected._meta?.["lexicon/approval"]).toBeUndefined();
  }
  expect(call).not.toHaveBeenCalled();
  expect(issue).not.toHaveBeenCalled();
  expect(f.writes()).toBe(0);
});
it("reports an unavailable UI and cannot fall back to chat approval", async () => {
  const f = await connected();
  const plan = await f.runtime.plans.create([
    { tool: "lexicon_update_track", input: { id: 1, edits: { rating: 2 } } },
  ]);
  const status = await f.client.callTool({
    name: "lexicon_ui_status",
    arguments: {},
  });
  expect((status.structuredContent as any).result.mode).toBe("unavailable");
  const response = await f.client.callTool({
    name: "lexicon_review_change_plan",
    arguments: { id: plan.id },
  });
  expect((response.structuredContent as any).result.review.mode).toBe(
    "unavailable",
  );
  expect(response._meta?.["lexicon/approval"]).toBeUndefined();
  await expect(
    f.runtime.call("lexicon_apply_change_plan", {
      id: plan.id,
      hash: plan.hash,
      confirmation: "yes",
    }),
  ).rejects.toThrow("UI");
  expect(f.writes()).toBe(0);
});
it("handles a native MCP dialog through the actual planning and review tools", async () => {
  const f = await connected(false, true, true);
  const dialog = vi.fn(async () => ({
    action: "accept" as const,
    content: { approve: true },
  }));
  f.client.setRequestHandler("elicitation/create", dialog);
  const pending = await f.client.callTool({
    name: "lexicon_plan_changes",
    arguments: {
      operations: [
        {
          tool: "lexicon_update_track",
          input: { id: 1, edits: { rating: 2 } },
        },
      ],
    },
  });
  expect(dialog).not.toHaveBeenCalled();
  expect(f.writes()).toBe(0);
  const plan = (pending.structuredContent as any).result;
  expect(plan.review.mode).toBe("native-mcp-dialog");
  const result = await f.client.callTool({
    name: "lexicon_review_change_plan",
    arguments: { id: plan.id },
  });
  expect(result.isError).not.toBe(true);
  expect(dialog).toHaveBeenCalledOnce();
  expect(f.writes()).toBe(1);
  expect((result.structuredContent as any).result.status).toBe("completed");
});

it.each([
  { action: "cancel" },
  { action: "decline" },
  { action: "accept", content: { approve: false } },
] as const)(
  "leaves the plan pending after a native dialog returns %j, without a retry instruction",
  async (answer) => {
    const f = await connected(false, true, true);
    const dialog = vi.fn(async () => answer);
    f.client.setRequestHandler("elicitation/create", dialog);
    const plan = await f.runtime.plans.create([
      { tool: "lexicon_update_track", input: { id: 1, edits: { rating: 2 } } },
    ]);
    const response = await f.client.callTool({
      name: "lexicon_review_change_plan",
      arguments: { id: plan.id },
    });
    expect(response.isError).not.toBe(true);
    const result = (response.structuredContent as any).result;
    expect(result.status).toBe("pending");
    expect(result.review.dismissed).toBe(true);
    expect(result.review.nextTool).toBeUndefined();
    expect(result.review.message).toContain("Do not cancel it or reopen");
    expect(response._meta?.["lexicon/approval"]).toBeUndefined();
    expect((await f.runtime.plans.get(plan.id)).status).toBe("pending");
    expect(dialog).toHaveBeenCalledOnce();
    expect(f.writes()).toBe(0);
  },
);
