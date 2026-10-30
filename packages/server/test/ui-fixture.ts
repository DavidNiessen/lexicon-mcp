import { runInNewContext } from "node:vm";
import { previewClient } from "../src/ui/client.js";
import { previewFor, type Preview } from "../src/ui/model.js";

export class Element {
  children: Element[] = [];
  hidden = false;
  disabled = false;
  value = "";
  className = "";
  scope = "";
  dataset: Record<string, string> = {};
  ownText = "";
  scrollHeight = 640;
  listeners = new Map<string, (event?: any) => unknown>();
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
  addEventListener(name: string, callback: (event?: any) => unknown) {
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
  input(value: string) {
    this.value = value;
    return this.listeners.get("input")?.();
  }
}
export const plan = {
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
export const model = previewFor(plan)!;
export const grant = {
  id: plan.id,
  hash: plan.hash,
  token: "c".repeat(64),
  expiresAt: new Date(Date.now() + 60000).toISOString(),
};
export async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
export function fixture(
  openai?: Record<string, any>,
  standalone = false,
  options: { initial?: Preview | null } = {},
) {
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
  elements.get("initial")!.textContent = JSON.stringify(
    "initial" in options ? options.initial : model,
  );
  elements.get("details")!.hidden = true;
  const messages: any[] = [];
  const listeners = new Map<string, ((event: any) => void)[]>();
  const documentListeners = new Map<string, ((event: any) => void)[]>();
  const timers = new Map<number, () => void>();
  const intervals: (() => void)[] = [];
  const frames: (() => void)[] = [];
  let timerId = 0;
  const register = (
    target: typeof listeners,
    name: string,
    handler: (event: any) => void,
  ) => {
    target.set(name, [...(target.get(name) ?? []), handler]);
  };
  const window: any = {
    openai,
    addEventListener: (name: string, handler: (event: any) => void) =>
      register(listeners, name, handler),
    postMessage: (message: any) => messages.push(message),
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
  };
  const parent = { postMessage: (message: any) => messages.push(message) };
  window.parent = standalone ? window : parent;
  const document = {
    getElementById: (id: string) => elements.get(id),
    createElement: (tag: string) => new Element(tag),
    documentElement: {
      dataset: {},
      scrollHeight: 640,
      style: { setProperty: () => undefined },
    },
    body: { scrollHeight: 640 },
    visibilityState: "visible",
    addEventListener: (name: string, handler: (event: any) => void) =>
      register(documentListeners, name, handler),
  };
  runInNewContext(previewClient, {
    window,
    document,
    Map,
    Error,
    Promise,
    Date,
    requestAnimationFrame: window.requestAnimationFrame,
    setTimeout: (callback: () => void) => {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout: (id: number) => timers.delete(id),
    setInterval: (callback: () => void) => {
      intervals.push(callback);
      return intervals.length;
    },
  });
  const event = (name: string, data: Record<string, unknown> = {}) =>
    listeners.get(name)?.forEach((handler) => handler(data));
  const documentEvent = (name: string) =>
    documentListeners.get(name)?.forEach((handler) => handler({}));
  const send = (data: any, source = window.parent) =>
    event("message", { source, data });
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
  const globals = (value: Record<string, unknown>) => {
    if (window.openai) Object.assign(window.openai, value);
    event("openai:set_globals", { detail: { globals: value } });
  };
  const flushFrames = () => {
    for (const frame of frames.splice(0)) frame();
  };
  return {
    elements,
    messages,
    document,
    send,
    ready,
    result,
    window,
    event,
    documentEvent,
    globals,
    timers,
    intervals,
    flushFrames,
  };
}
