import { expect, it } from "vitest";
import { fixture, grant, model, plan } from "./ui-fixture.js";

it("renders a read-only preview when the host does not advertise tool-call forwarding", async () => {
  const f = fixture();
  expect(
    f.messages.find((message) => message.method === "ui/initialize").params
      .protocolVersion,
  ).toBe("2026-01-26");
  await f.ready({ theme: "dark" }, {});
  f.result();
  expect(f.elements.get("title")!.textContent).toBe(model.title);
  expect(f.elements.get("preview")!.textContent).toContain("Industrial");
  expect(f.elements.get("apply-changes")!.disabled).toBe(true);
  expect(f.elements.get("cancel-changes")!.disabled).toBe(true);
  expect(f.elements.get("approval-status")!.textContent).toContain(
    "does not advertise MCP tool-call support",
  );
  f.elements.get("apply-changes")!.click();
  f.elements.get("cancel-changes")!.click();
  f.event("pageshow");
  expect(f.elements.get("state")!.textContent).toBe("pending");
  expect(f.messages.some((message) => message.method === "tools/call")).toBe(
    false,
  );
});

it("enables declared tool forwarding without making a call until a user clicks", async () => {
  const f = fixture();
  await f.ready({ theme: "dark" }, { serverTools: {} });
  f.result();
  expect(f.elements.get("apply-changes")!.disabled).toBe(false);
  expect(f.messages.some((message) => message.method === "tools/call")).toBe(
    false,
  );
  const applying = f.elements.get("apply-changes")!.click();
  const calls = f.messages.filter((message) => message.method === "tools/call");
  expect(calls).toHaveLength(1);
  f.send({
    jsonrpc: "2.0",
    id: calls[0].id,
    result: { structuredContent: { result: { ...plan, status: "completed" } } },
  });
  await applying;
  expect(f.elements.get("state")!.textContent).toBe("completed");
});

it.each(["apply-changes", "cancel-changes"])(
  "blocks further calls after an IPC failure on %s and keeps the plan pending",
  async (button) => {
    const f = fixture();
    await f.ready();
    f.result();
    const submitted = f.elements.get(button)!.click();
    const call = f.messages.find((message) => message.method === "tools/call");
    f.send({
      jsonrpc: "2.0",
      id: call.id,
      error: { code: -32603, message: "IPC not available for MCP tool call" },
    });
    await submitted;
    expect(f.elements.get("state")!.textContent).toBe("pending");
    expect(f.elements.get("approval-status")!.textContent).toContain(
      "Claude's widget tool-call bridge",
    );
    expect(f.elements.get("apply-changes")!.disabled).toBe(true);
    expect(f.elements.get("cancel-changes")!.disabled).toBe(true);
    const fallbackCalls: unknown[] = [];
    f.window.openai = {
      callTool: async (...args: unknown[]) => {
        fallbackCalls.push(args);
        return {};
      },
    };
    f.globals({
      theme: "light",
      toolOutput: { result: plan },
      toolResponseMetadata: {
        "lexicon/preview": model,
        "lexicon/approval": grant,
      },
    });
    f.result();
    f.event("pageshow");
    f.documentEvent("visibilitychange");
    for (const interval of f.intervals) interval();
    f.elements.get("apply-changes")!.click();
    f.elements.get("cancel-changes")!.click();
    expect(f.elements.get("state")!.textContent).toBe("pending");
    expect(f.elements.get("apply-changes")!.disabled).toBe(true);
    expect(f.elements.get("approval-status")!.textContent).toContain(
      "IPC unavailable",
    );
    expect(
      f.messages.filter((message) => message.method === "tools/call"),
    ).toHaveLength(1);
    expect(f.messages.some((message) => message.method === "ui/message")).toBe(
      false,
    );
    expect(fallbackCalls).toHaveLength(0);
  },
);

it("keeps the OpenAI compatibility bridge available without a standard handshake", async () => {
  const calls: unknown[] = [];
  const states: unknown[] = [];
  const f = fixture({
    callTool: async (...args: unknown[]) => {
      calls.push(args);
      return {
        structuredContent: { result: { ...plan, status: "completed" } },
      };
    },
    setWidgetState: (value: unknown) => states.push(value),
    toolOutput: { result: plan },
    toolResponseMetadata: {
      "lexicon/preview": model,
      "lexicon/approval": grant,
    },
  });
  expect(f.elements.get("apply-changes")!.disabled).toBe(false);
  expect(calls).toHaveLength(0);
  await f.elements.get("apply-changes")!.click();
  expect(calls).toHaveLength(1);
  expect(f.elements.get("state")!.textContent).toBe("completed");
  expect(JSON.stringify(states)).not.toContain(grant.token);
});

it("also blocks a compatibility bridge that returns the IPC failure as a tool error", async () => {
  const calls: unknown[] = [];
  const f = fixture({
    callTool: async (...args: unknown[]) => {
      calls.push(args);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "IPC not available for MCP tool call",
            }),
          },
        ],
      };
    },
    toolOutput: { result: plan },
    toolResponseMetadata: {
      "lexicon/preview": model,
      "lexicon/approval": grant,
    },
  });
  await f.elements.get("apply-changes")!.click();
  expect(f.elements.get("state")!.textContent).toBe("pending");
  expect(f.elements.get("approval-status")!.textContent).toContain(
    "cannot confirm the operation",
  );
  f.globals({
    toolResponseMetadata: {
      "lexicon/preview": model,
      "lexicon/approval": grant,
    },
  });
  await f.elements.get("apply-changes")!.click();
  expect(calls).toHaveLength(1);
  expect(f.elements.get("cancel-changes")!.disabled).toBe(true);
  expect(
    f.messages.some(
      (message) =>
        message.method === "tools/call" || message.method === "ui/message",
    ),
  ).toBe(false);
});
