import { expect, it } from "vitest";
import { fixture, grant, model, plan } from "./ui-fixture.js";
import { previewClient } from "../src/ui/client.js";

it("renders and filters a pending plan without any approval controls or tool calls", async () => {
  const f = fixture();
  await f.ready();
  f.result();
  expect(f.elements.get("preview")!.textContent).toContain("Industrial");
  for (const id of [
    "apply-changes",
    "cancel-changes",
    "approval-controls",
    "approval-status",
  ])
    expect(f.elements.has(id)).toBe(false);
  f.elements.get("filter")!.input("no match");
  expect(f.elements.get("row-status")!.textContent).toBe("0 of 1 rows shown");
  f.elements.get("filter")!.input("Industrial");
  expect(f.elements.get("row-status")!.textContent).toBe("1 of 1 rows shown");
  f.elements.get("show-details")!.click();
  expect(f.elements.get("details")!.textContent).toContain(plan.id);
  expect(f.elements.get("details")!.textContent).not.toContain(grant.token);
  expect(
    f.messages.some(
      (message) =>
        message.method === "tools/call" || message.method === "ui/message",
    ),
  ).toBe(false);
});

it("keeps embedded previews readable when the host never initializes", () => {
  const f = fixture(undefined, true);
  expect(f.elements.get("title")!.textContent).toBe(model.title);
  for (const timer of f.timers.values()) timer();
  for (const interval of f.intervals) interval();
  expect(f.elements.get("state")!.textContent).toBe("pending");
  expect(
    f.messages.some(
      (message) =>
        message.method === "tools/call" || message.method === "ui/message",
    ),
  ).toBe(false);
});

it("ignores result messages from unrelated windows", async () => {
  const f = fixture(undefined, false, { initial: null });
  await f.ready();
  f.send(
    {
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: { _meta: { "lexicon/preview": model } },
    },
    {},
  );
  expect(f.elements.get("preview")!.textContent).not.toContain("Industrial");
  f.result();
  expect(f.elements.get("preview")!.textContent).toContain("Industrial");
});

it("contains no mutation bridge even when stale hosts provide approval metadata", () => {
  const calls: unknown[] = [];
  const states: unknown[] = [];
  const f = fixture({
    callTool: async (...args: unknown[]) => {
      calls.push(args);
      return {};
    },
    setWidgetState: (state: unknown) => states.push(state),
    toolOutput: { result: plan },
    toolResponseMetadata: {
      "lexicon/preview": model,
      "lexicon/approval": grant,
    },
  });
  f.elements.get("show-details")!.click();
  f.elements.get("filter")!.input("Industrial");
  f.event("pageshow");
  f.documentEvent("visibilitychange");
  expect(calls).toHaveLength(0);
  expect(JSON.stringify(states)).not.toContain(grant.token);
  expect(previewClient).not.toContain("callTool");
  expect(previewClient).not.toContain("tools/call");
  expect(previewClient).not.toContain("ui/message");
});
