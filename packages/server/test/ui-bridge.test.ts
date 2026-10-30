import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { previewClient } from "../src/ui/client.js";
import { previewFor } from "../src/ui/model.js";

class Element {
  children: Element[] = [];
  hidden = false;
  disabled = false;
  value = "";
  className = "";
  scope = "";
  dataset: Record<string, string> = {};
  ownText = "";
  listeners = new Map<string, () => unknown>();
  attrs: Record<string, string> = {};
  constructor(readonly tag: string) {}
  get textContent(): string {
    return (
      this.ownText + this.children.map((child) => child.textContent).join("")
    );
  }
  set textContent(value: string) {
    this.ownText = String(value);
    this.children = [];
  }
  append(...children: Element[]) {
    this.children.push(...children);
  }
  replaceChildren(...children: Element[]) {
    this.children = children;
    this.ownText = "";
  }
  addEventListener(name: string, callback: () => unknown) {
    this.listeners.set(name, callback);
  }
  setAttribute(name: string, value: string) {
    this.attrs[name] = value;
  }
  querySelectorAll() {
    const rows: Element[] = [];
    const visit = (element: Element) => {
      for (const child of element.children) {
        if (child.tag === "tr" && element.tag === "tbody") rows.push(child);
        visit(child);
      }
    };
    visit(this);
    return rows;
  }
  click() {
    return this.listeners.get("click")?.();
  }
}
const plan = {
  id: "b8ab6d25-07f7-4487-88cf-82a0ef965fe9",
  hash: "a".repeat(64),
  status: "pending",
  operations: [
    {
      tool: "lexicon_update_track",
      input: { id: 1, edits: { genre: "Industrial" } },
    },
  ],
  before: [{ track: { id: 1, title: "Track", genre: "Schranz" } }],
};
const model = previewFor(plan)!;
const grant = {
  id: plan.id,
  hash: plan.hash,
  token: "c".repeat(64),
  expiresAt: new Date(Date.now() + 60000).toISOString(),
};
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
function fixture(openai?: Record<string, any>, standalone = false) {
  const elements = new Map<string, Element>();
  for (const id of [
    "preview",
    "filter",
    "row-status",
    "apply-changes",
    "cancel-changes",
    "approval-status",
    "approval-controls",
    "title",
    "description",
    "state",
    "note",
    "facts",
    "empty",
    "truncation",
    "show-details",
    "details",
    "initial",
  ])
    elements.set(id, new Element(id));
  elements.get("initial")!.textContent = JSON.stringify(model);
  elements.get("details")!.hidden = true;
  const messages: any[] = [],
    listeners: ((event: any) => void)[] = [],
    timers = new Map<number, () => void>();
  let timerId = 0;
  const window: any = {
    openai,
    addEventListener: (name: string, handler: (event: any) => void) => {
      if (name === "message") listeners.push(handler);
    },
    postMessage: (message: any) => messages.push(message),
  };
  const parent = { postMessage: (message: any) => messages.push(message) };
  window.parent = standalone ? window : parent;
  const document = {
    getElementById: (id: string) => elements.get(id),
    createElement: (tag: string) => new Element(tag),
    documentElement: { dataset: {} },
  };
  runInNewContext(previewClient, {
    window,
    document,
    Map,
    Error,
    Promise,
    Date,
    setTimeout: (callback: () => void) => {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout: (id: number) => timers.delete(id),
    setInterval: () => 0,
  });
  const send = (data: any, source = window.parent) =>
    listeners.forEach((handler) => handler({ source, data }));
  const ready = async () => {
    const init = messages.find((message) => message.method === "ui/initialize");
    send({
      jsonrpc: "2.0",
      id: init.id,
      result: { hostContext: { theme: "dark" } },
    });
    await flush();
  };
  const result = (approval: any = grant) =>
    send({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        structuredContent: { result: plan },
        _meta: { "lexicon/preview": model, "lexicon/approval": approval },
      },
    });
  return { elements, messages, document, send, ready, result, window };
}
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
