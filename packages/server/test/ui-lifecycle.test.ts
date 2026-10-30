import { expect, it } from "vitest";
import { previewFor } from "../src/ui/model.js";
import { fixture, grant, model, plan } from "./ui-fixture.js";

const metadata = { "lexicon/preview": model, "lexicon/approval": grant };
const envelope = { structuredContent: { result: plan }, _meta: metadata };
const cached = (preview = model, filter = "", detailsOpen = false) => ({
  privateContent: { lexicon: { version: 1, preview, filter, detailsOpen } },
});
function bridge(extra: Record<string, any> = {}) {
  const calls: any[] = [],
    states: any[] = [],
    heights: number[] = [];
  const api: Record<string, any> = {
    callTool: async (...args: unknown[]) => {
      calls.push(args);
      return {};
    },
    setWidgetState: (state: unknown) => {
      states.push(state);
      api.widgetState = state;
    },
    notifyIntrinsicHeight: (height: number) => heights.push(height),
    ...extra,
  };
  return { calls, states, heights, api };
}

it.each(["mcp_tool_result", "call_tool_result"])(
  "hydrates an empty remounted template from canonical %s metadata",
  (key) => {
    const host = bridge({
      toolOutput: { result: plan },
      toolResponseMetadata: { [key]: envelope },
    });
    const f = fixture(host.api, false, { initial: null });
    expect(f.elements.get("title")!.textContent).toBe(model.title);
    expect(f.elements.get("preview")!.textContent).toContain("Industrial");
    expect(f.elements.get("apply-changes")!.disabled).toBe(false);
    expect(host.calls).toHaveLength(0);
  },
);

it("keeps a valid preview and grant when globals arrive in partial updates", () => {
  const host = bridge({
    toolOutput: { result: plan },
    toolResponseMetadata: metadata,
  });
  const f = fixture(host.api, false, { initial: null });
  f.globals({ theme: "dark" });
  f.globals({ toolOutput: { result: plan } });
  expect(f.document.documentElement.dataset.theme).toBe("dark");
  expect(f.elements.get("preview")!.textContent).toContain("Industrial");
  expect(f.elements.get("apply-changes")!.disabled).toBe(false);
  expect(host.calls).toHaveLength(0);
});

it("connects a delayed OpenAI bridge without waiting for a new tool invocation", () => {
  const f = fixture(undefined, false, { initial: null });
  const host = bridge({
    toolOutput: { result: plan },
    toolResponseMetadata: { mcp_tool_result: envelope },
  });
  f.window.openai = host.api;
  f.globals({
    toolOutput: { result: plan },
    toolResponseMetadata: { mcp_tool_result: envelope },
  });
  expect(f.elements.get("title")!.textContent).toBe(model.title);
  expect(f.elements.get("apply-changes")!.disabled).toBe(false);
  expect(host.calls).toHaveLength(0);
});

it("restores a cached report, filter, and disclosure across iframe remounts", () => {
  const report = previewFor({
    findings: [{ trackId: 1, issue: "missing_metadata" }],
    scanned: 1,
    total: 1,
  })!;
  const firstHost = bridge({
    toolResponseMetadata: { "lexicon/preview": report },
  });
  const first = fixture(firstHost.api, false, { initial: null });
  first.elements.get("filter")!.input("missing");
  first.elements.get("show-details")!.click();
  const state = firstHost.states.at(-1);
  expect(state?.privateContent?.lexicon).toMatchObject({
    version: 1,
    filter: "missing",
    detailsOpen: true,
  });
  const nextHost = bridge({ widgetState: state });
  const remounted = fixture(nextHost.api, false, { initial: null });
  expect(remounted.elements.get("title")!.textContent).toBe(report.title);
  expect(remounted.elements.get("filter")!.value).toBe("missing");
  expect(remounted.elements.get("details")!.hidden).toBe(false);
  expect(remounted.elements.get("details")!.textContent).toContain(
    "missing_metadata",
  );
  expect(remounted.elements.get("approval-controls")!.hidden).toBe(true);
  expect(nextHost.calls).toHaveLength(0);
});

it("never persists approval credentials and restores cached pending plans without permission to apply", () => {
  const host = bridge({ toolResponseMetadata: metadata });
  const f = fixture(host.api, false, { initial: null });
  f.elements.get("filter")!.input("Industrial");
  const state = host.states.at(-1);
  expect(state?.privateContent?.lexicon?.preview?.plan?.id).toBe(plan.id);
  expect(JSON.stringify(host.states)).not.toContain(grant.token);
  expect(JSON.stringify(state)).not.toContain("lexicon/approval");
  const nextHost = bridge({ widgetState: state });
  const remounted = fixture(nextHost.api, false, { initial: null });
  expect(remounted.elements.get("preview")!.textContent).toContain(
    "Industrial",
  );
  expect(remounted.elements.get("apply-changes")!.disabled).toBe(true);
  expect(remounted.elements.get("cancel-changes")!.disabled).toBe(true);
  expect(nextHost.calls).toHaveLength(0);
});

it.each(["completed", "cancelled", "failed", "interrupted"])(
  "preserves a cached %s outcome when the host replays the original pending result",
  (status) => {
    const completed = previewFor({ ...plan, status })!;
    const host = bridge({
      widgetState: cached(completed),
      toolOutput: { result: plan },
      toolResponseMetadata: metadata,
    });
    const f = fixture(host.api, false, { initial: null });
    expect(f.elements.get("state")!.textContent).toBe(status);
    expect(f.elements.get("apply-changes")!.disabled).toBe(true);
    expect(f.elements.get("cancel-changes")!.disabled).toBe(true);
    expect(host.calls).toHaveLength(0);
  },
);

it("does not overwrite cached completion when embedded initial HTML renders before widget restoration", () => {
  const completed = previewFor({ ...plan, status: "completed" })!;
  const host = bridge({
    widgetState: cached(completed, "Industrial", true),
    toolOutput: { result: plan },
    toolResponseMetadata: metadata,
  });
  const f = fixture(host.api);
  expect(f.elements.get("state")!.textContent).toBe("completed");
  expect(f.elements.get("filter")!.value).toBe("Industrial");
  expect(f.elements.get("details")!.hidden).toBe(false);
  expect(f.elements.get("apply-changes")!.disabled).toBe(true);
  expect(host.api.widgetState.privateContent.lexicon.preview.plan.status).toBe(
    "completed",
  );
  expect(host.calls).toHaveLength(0);
});

it("replaces a cached snapshot when a different authoritative plan arrives", () => {
  const nextPlan = {
    ...plan,
    id: "1f4215dc-f122-45d9-b327-82e9991c0ad7",
    hash: "b".repeat(64),
  };
  const nextPreview = previewFor(nextPlan)!;
  const host = bridge({
    widgetState: cached(model),
    toolResponseMetadata: {
      "lexicon/preview": nextPreview,
      "lexicon/approval": { ...grant, id: nextPlan.id, hash: nextPlan.hash },
    },
  });
  const f = fixture(host.api, false, { initial: null });
  f.elements.get("show-details")!.click();
  expect(f.elements.get("details")!.textContent).toContain(nextPlan.id);
  expect(f.elements.get("apply-changes")!.disabled).toBe(false);
  expect(host.calls).toHaveLength(0);
});

it("survives absent or failing host persistence without losing the current preview", () => {
  for (const setWidgetState of [
    undefined,
    () => {
      throw new Error("Host persistence unavailable");
    },
  ]) {
    const host = bridge({ toolResponseMetadata: metadata, setWidgetState });
    const f = fixture(host.api, false, { initial: null });
    expect(() => f.elements.get("filter")!.input("Industrial")).not.toThrow();
    expect(f.elements.get("preview")!.textContent).toContain("Industrial");
    expect(f.elements.get("apply-changes")!.disabled).toBe(false);
    expect(host.calls).toHaveLength(0);
  }
});

it("never applies, cancels, or sends zero height when the chat hides and becomes visible again", () => {
  const host = bridge({ toolResponseMetadata: metadata });
  const f = fixture(host.api, false, { initial: null });
  f.document.visibilityState = "hidden";
  f.document.documentElement.scrollHeight = 0;
  f.document.body.scrollHeight = 0;
  f.documentEvent("visibilitychange");
  f.event("pagehide");
  f.flushFrames();
  f.document.visibilityState = "visible";
  f.document.documentElement.scrollHeight = 720;
  f.document.body.scrollHeight = 720;
  f.documentEvent("visibilitychange");
  f.event("pageshow");
  f.flushFrames();
  expect(host.heights).toContain(720);
  expect(host.heights.every((height) => height > 0)).toBe(true);
  expect(host.calls).toHaveLength(0);
  expect(f.elements.get("state")!.textContent).toBe("pending");
});
