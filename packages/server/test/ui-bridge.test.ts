import { expect, it } from "vitest";
import { fixture, grant, model, plan } from "./ui-fixture.js";
it("does not apply upon hydration and sends one bound approval only after an Apply click", async () => {
  const f = fixture();
  expect(f.elements.get("apply-changes")!.disabled).toBe(true);
  await f.ready();
  f.result();
  expect(f.document.documentElement.dataset.theme).toBe("dark");
  expect(
    f.messages.filter((message) => message.method === "tools/call"),
  ).toHaveLength(0);
  expect(f.elements.get("apply-changes")!.disabled).toBe(false);
  f.elements.get("show-details")!.click();
  expect(f.elements.get("details")!.textContent).not.toContain(grant.token);
  const first = f.elements.get("apply-changes")!.click();
  f.elements.get("apply-changes")!.click();
  const calls = f.messages.filter((message) => message.method === "tools/call");
  expect(calls).toHaveLength(1);
  expect(calls[0].params).toEqual({
    name: "lexicon_confirm_change_plan",
    arguments: {
      id: grant.id,
      hash: grant.hash,
      token: grant.token,
      decision: "apply",
    },
  });
  expect(f.elements.get("apply-changes")!.disabled).toBe(true);
  f.send({
    jsonrpc: "2.0",
    id: calls[0].id,
    result: { structuredContent: { result: { ...plan, status: "completed" } } },
  });
  await first;
  expect(f.elements.get("approval-status")!.textContent).toBe(
    "Changes applied.",
  );
  expect(f.elements.get("apply-changes")!.disabled).toBe(true);
});
it("cancels via the host and never falls back to text or direct mutation calls", async () => {
  const f = fixture();
  await f.ready();
  f.result();
  const cancelled = f.elements.get("cancel-changes")!.click();
  const call = f.messages.find((message) => message.method === "tools/call");
  expect(call.params.arguments.decision).toBe("cancel");
  f.send({
    jsonrpc: "2.0",
    id: call.id,
    result: { structuredContent: { result: { ...plan, status: "cancelled" } } },
  });
  await cancelled;
  expect(f.elements.get("approval-status")!.textContent).toContain(
    "No changes were applied",
  );
  expect(f.messages.some((message) => message.method === "ui/message")).toBe(
    false,
  );
});
it("keeps actions disabled without a bridge, valid grant, or exact plan match", async () => {
  const standalone = fixture(undefined, true);
  standalone.result();
  expect(standalone.elements.get("apply-changes")!.disabled).toBe(true);
  const f = fixture();
  await f.ready();
  f.result(null);
  expect(f.elements.get("apply-changes")!.disabled).toBe(true);
  f.result({ ...grant, hash: "b".repeat(64) });
  expect(f.elements.get("apply-changes")!.disabled).toBe(true);
  f.result({ ...grant, token: "short" });
  expect(f.elements.get("apply-changes")!.disabled).toBe(true);
  f.result({ ...grant, expiresAt: new Date(0).toISOString() });
  expect(f.elements.get("apply-changes")!.disabled).toBe(true);
  f.result(null);
  expect(f.elements.get("apply-changes")!.disabled).toBe(true);
  f.elements.get("apply-changes")!.click();
  expect(f.messages.some((message) => message.method === "tools/call")).toBe(
    false,
  );
});
it("rejects grants from non-parent messages and disables a rejected approval", async () => {
  const f = fixture();
  await f.ready();
  f.send(
    {
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        _meta: { "lexicon/preview": model, "lexicon/approval": grant },
      },
    },
    {},
  );
  expect(f.elements.get("apply-changes")!.disabled).toBe(true);
  f.result();
  const applied = f.elements.get("apply-changes")!.click();
  const call = f.messages.find((message) => message.method === "tools/call");
  f.send({
    jsonrpc: "2.0",
    id: call.id,
    error: { message: "Plan is stale. Reopen it." },
  });
  await applied;
  expect(f.elements.get("approval-status")!.textContent).toContain(
    "Plan is stale",
  );
  expect(f.elements.get("apply-changes")!.disabled).toBe(true);
});
it("supports the OpenAI component bridge while keeping credentials out of visible data", async () => {
  const calls: any[] = [];
  const f = fixture({
    toolOutput: { result: plan },
    toolResponseMetadata: {
      "lexicon/preview": model,
      "lexicon/approval": grant,
    },
    callTool: async (name: string, args: any) => {
      calls.push({ name, args });
      return {
        structuredContent: { result: { ...plan, status: "completed" } },
      };
    },
  });
  expect(f.messages.some((message) => message.method === "ui/initialize")).toBe(
    false,
  );
  await f.elements.get("apply-changes")!.click();
  expect(calls).toHaveLength(1);
  expect(calls[0].args.token).toBe(grant.token);
  expect(
    [...f.elements.values()].map((element) => element.textContent).join(""),
  ).not.toContain(grant.token);
});
