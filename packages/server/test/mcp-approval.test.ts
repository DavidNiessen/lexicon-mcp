import { expect, it, vi } from "vitest";
import { connected } from "./mcp-fixture.js";

const operations = [
  { tool: "lexicon_update_track", input: { id: 1, edits: { rating: 2 } } },
];
const resultOf = (response: any) => response.structuredContent.result;
const hasResource = (response: any) =>
  response.content.some((item: any) => item.type === "resource");

it("separates compact planning, inspection, read-only preview, and client approval without exposing credentials", async () => {
  const f = await connected(true, true, true);
  const issue = vi.spyOn(f.runtime.approvals, "issue");
  const dialog = vi.fn(async () => ({ action: "cancel" as const }));
  f.client.setRequestHandler("elicitation/create", dialog);
  const planned = await f.client.callTool({
    name: "lexicon_plan_changes",
    arguments: { operations },
  });
  expect(planned.isError).not.toBe(true);
  const plan = resultOf(planned);
  expect(plan.operationCount).toBe(1);
  expect(plan.review.nextTool).toBe("lexicon_preview_change_plan");
  const inspected = await f.client.callTool({
    name: "lexicon_get_change_plan",
    arguments: { id: plan.id },
  });
  expect(resultOf(inspected).review.nextTool).toBeUndefined();
  const previewed = await f.client.callTool({
    name: "lexicon_preview_change_plan",
    arguments: { id: plan.id },
  });
  expect(previewed.isError).not.toBe(true);
  expect(resultOf(previewed).review.nextTool).toBe(
    "lexicon_review_change_plan",
  );
  expect(previewed._meta?.["lexicon/preview"]).toBeDefined();
  expect(dialog).not.toHaveBeenCalled();
  const reviewed = await f.client.callTool({
    name: "lexicon_review_change_plan",
    arguments: { id: plan.id },
  });
  expect(dialog).toHaveBeenCalledOnce();
  expect(resultOf(reviewed).review.dismissed).toBe(true);
  expect(resultOf(reviewed).review.nextTool).toBeUndefined();
  for (const stage of [planned, inspected, previewed, reviewed]) {
    expect(hasResource(stage)).toBe(false);
    expect(stage._meta?.["lexicon/approval"]).toBeUndefined();
    expect(resultOf(stage).operations).toBeUndefined();
    expect(resultOf(stage).before).toBeUndefined();
  }
  expect(issue).not.toHaveBeenCalled();
  expect(f.writes()).toBe(0);
  const tools = (await f.client.listTools()).tools;
  const flowNames = [
    "lexicon_plan_changes",
    "lexicon_get_change_plan",
    "lexicon_preview_change_plan",
    "lexicon_review_change_plan",
    "lexicon_decide_change_plan",
  ];
  const flowTools = flowNames.map(
    (name) => tools.find((tool) => tool.name === name)!,
  );
  expect(
    flowTools
      .filter((tool) => (tool._meta?.ui as any)?.resourceUri)
      .map((tool) => tool.name),
  ).toEqual(["lexicon_preview_change_plan"]);
  for (const name of [
    "lexicon_confirm_change_plan",
    "lexicon_apply_change_plan",
    "lexicon_cancel_change_plan",
  ]) {
    expect(tools.some((tool) => tool.name === name)).toBe(false);
    await expect(
      f.client.callTool({
        name,
        arguments: { id: plan.id, hash: plan.hash, confirmation: "yes" },
      }),
    ).rejects.toThrow("not found");
  }
  expect((await f.runtime.plans.get(plan.id)).operations).toEqual(operations);
});

it("keeps protected mutation planning data-only and points to the separate preview", async () => {
  const f = await connected(true);
  const pending = await f.client.callTool({
    name: "lexicon_delete_tracks",
    arguments: { ids: [1] },
  });
  expect(pending.isError).not.toBe(true);
  expect(resultOf(pending).plan.status).toBe("pending");
  expect(resultOf(pending).plan.operationCount).toBe(1);
  expect(resultOf(pending).plan.operations).toBeUndefined();
  expect(resultOf(pending).plan.before).toBeUndefined();
  expect(resultOf(pending).review.nextTool).toBe("lexicon_preview_change_plan");
  expect(pending._meta?.["lexicon/preview"]).toBeUndefined();
  expect(pending._meta?.["lexicon/approval"]).toBeUndefined();
  expect(hasResource(pending)).toBe(false);
  expect(f.writes()).toBe(0);
});

it("renders read-only workflow reports without issuing approval or accepting plan-shaped data", async () => {
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
  expect(hasResource(rendered)).toBe(false);
  expect(rendered._meta?.["lexicon/approval"]).toBeUndefined();
  expect(rendered._meta?.["lexicon/review"]).toBeUndefined();
  for (const proposed of [
    { operations: [] },
    { plan: { operations: [] } },
    { result: { operations: [] } },
    { ...report, extra: { operations: [] } },
  ]) {
    expect(
      (
        await f.client.callTool({
          name: "lexicon_show_report",
          arguments: { report: proposed },
        })
      ).isError,
    ).toBe(true);
  }
  expect(call).not.toHaveBeenCalled();
  expect(issue).not.toHaveBeenCalled();
  expect(f.writes()).toBe(0);
});

it("uses native client approval even when embedded Apps are also advertised", async () => {
  const f = await connected(true, true, true);
  const dialog = vi.fn(async () => ({
    action: "accept" as const,
    content: { approve: true },
  }));
  f.client.setRequestHandler("elicitation/create", dialog);
  const pending = await f.client.callTool({
    name: "lexicon_plan_changes",
    arguments: { operations },
  });
  expect(dialog).not.toHaveBeenCalled();
  const plan = resultOf(pending);
  expect(plan.review.mode).toBe("native-mcp-dialog");
  const approved = await f.client.callTool({
    name: "lexicon_review_change_plan",
    arguments: { id: plan.id },
  });
  expect(approved.isError).not.toBe(true);
  expect(dialog).toHaveBeenCalledOnce();
  expect(f.writes()).toBe(1);
  expect(resultOf(approved).status).toBe("completed");
  expect(hasResource(approved)).toBe(false);
  expect(approved._meta?.["lexicon/preview"]).toBeUndefined();
  expect(approved._meta?.["lexicon/approval"]).toBeUndefined();
});

it.each([
  { action: "cancel" },
  { action: "decline" },
  { action: "accept", content: { approve: false } },
] as const)(
  "leaves dismissed native reviews pending without requesting a retry for %j",
  async (answer) => {
    const f = await connected(false, true, true);
    const dialog = vi.fn(async () => answer);
    f.client.setRequestHandler("elicitation/create", dialog);
    const plan = await f.runtime.plans.create(operations);
    const response = await f.client.callTool({
      name: "lexicon_review_change_plan",
      arguments: { id: plan.id },
    });
    expect(response.isError).not.toBe(true);
    expect(resultOf(response).status).toBe("pending");
    expect(resultOf(response).review.dismissed).toBe(true);
    expect(resultOf(response).review.nextTool).toBeUndefined();
    expect(resultOf(response).review.message).toContain(
      "Do not cancel it or reopen",
    );
    expect(dialog).toHaveBeenCalledOnce();
    expect(f.writes()).toBe(0);
  },
);
