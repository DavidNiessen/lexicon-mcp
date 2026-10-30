import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { Client as LegacyClient } from "@modelcontextprotocol/sdk/client/index.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  CLIENT_CAPABILITIES_META_KEY,
  InMemoryTransport,
  McpServer,
  createMcpHandler,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { digest, type Plan } from "../src/changes.js";
import {
  createNativeReview,
  nativeReviewMessage,
  reviewCapabilities,
} from "../src/review.js";

const TOOL = "lexicon_review_change_plan";
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const run of cleanup.reverse()) await run();
  cleanup.length = 0;
});

function fixture(count = 1) {
  const operations = Array.from({ length: count }, (_, index) => ({
    tool: "lexicon_update_track",
    input: { id: index + 1, edits: { genre: "Industrial" } },
  }));
  const before = operations.map((_, index) => ({
    id: index + 1,
    artist: "Artist",
    title: `Track ${index + 1}`,
    genre: "Schranz",
  }));
  const plan: Plan = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    hash: digest({ operations, before }),
    status: "pending",
    operations,
    before,
    outcomes: [],
  };
  const runtime = {
    plans: { get: vi.fn(async () => plan) },
    approvals: {
      issue: vi.fn(async () => ({
        id: plan.id,
        hash: plan.hash,
        token: "secret-ui-grant",
      })),
    },
    confirmFromUi: vi.fn(
      async ({ decision }: { decision: "apply" | "cancel" }) => {
        plan.status = decision === "apply" ? "completed" : "cancelled";
        return plan;
      },
    ),
  };
  return { plan, runtime };
}

function harness(runtime: ReturnType<typeof fixture>["runtime"]) {
  const review = createNativeReview(runtime);
  const server = new McpServer(
    { name: "native-review-test", version: "1.0.0" },
    {
      requestState: { verify: review.verifyState },
      inputRequired: { roundTimeoutMs: 1000, maxRounds: 2 },
    },
  );
  server.registerTool(
    TOOL,
    { inputSchema: z.object({ id: z.string() }) },
    async (input, ctx) => {
      const resumed = await review.resume(TOOL, input, ctx);
      if (resumed)
        return {
          content: [{ type: "text", text: JSON.stringify(resumed.plan) }],
        };
      const plan = await runtime.plans.get(input.id);
      const next = await review.request(
        plan,
        TOOL,
        input,
        ctx,
        reviewCapabilities(ctx, server.server.getClientCapabilities()),
      );
      if (next.kind === "input-required") return next.response;
      return { content: [{ type: "text", text: JSON.stringify(next) }] };
    },
  );
  return server;
}

it("detects inline Apps and native forms without treating URL-only elicitation as a form", () => {
  const ctx = { mcpReq: {} } as ServerContext;
  expect(reviewCapabilities(ctx, { elicitation: {} })).toEqual({
    inline: false,
    form: true,
  });
  expect(reviewCapabilities(ctx, { elicitation: { form: {} } }).form).toBe(
    true,
  );
  expect(reviewCapabilities(ctx, { elicitation: { url: {} } }).form).toBe(
    false,
  );
  expect(
    reviewCapabilities(ctx, {
      extensions: {
        "io.modelcontextprotocol/ui": {
          mimeTypes: ["text/html;profile=mcp-app"],
        },
      },
    }).inline,
  ).toBe(true);
  const modern = {
    mcpReq: { envelope: { [CLIENT_CAPABILITIES_META_KEY]: {} } },
  } as ServerContext;
  expect(reviewCapabilities(modern, { elicitation: {} }).form).toBe(false);
});

it("shows the exact plan scope and explicitly identifies truncated previews", () => {
  const { plan } = fixture(117);
  const message = nativeReviewMessage(plan);
  expect(message).toContain("117 library operation(s)");
  expect(message).toContain(plan.hash);
  expect(message).toContain("Schranz | Industrial");
  expect(message).toMatch(/Showing \d+ of 117 changed fields/);
  expect(message).toContain("all 117 operations in this exact plan");
  expect(message).toContain("MCP approval form in your chat client");
  expect(message).toContain(
    "Leaving it unchecked, closing, or declining leaves the plan pending",
  );
  expect(message).not.toContain("unchecked to cancel");
});

it.each([
  [{ action: "accept", content: { approve: true } }, "completed", "apply"],
  [{ action: "accept", content: { approve: false } }, "pending", undefined],
] as const)(
  "uses a real legacy MCP dialog response %j",
  async (answer, status, decision) => {
    const { plan, runtime } = fixture();
    const server = harness(runtime);
    const client = new LegacyClient(
      { name: "legacy-ui", version: "1.0.0" },
      { capabilities: { elicitation: { form: {} } } },
    );
    const dialog = vi.fn(async () => answer);
    client.setRequestHandler(ElicitRequestSchema, dialog);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    cleanup.push(
      () => server.close(),
      () => client.close(),
    );
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({
      name: TOOL,
      arguments: { id: plan.id },
    });
    expect(result.isError).not.toBe(true);
    expect(dialog, JSON.stringify(result)).toHaveBeenCalledOnce();
    expect(dialog.mock.calls[0]?.[0]?.params.message).toContain(
      "Schranz | Industrial",
    );
    expect(plan.status).toBe(status);
    if (decision)
      expect(runtime.confirmFromUi).toHaveBeenCalledExactlyOnceWith({
        id: plan.id,
        hash: plan.hash,
        token: "secret-ui-grant",
        decision,
      });
    else {
      expect(runtime.approvals.issue).not.toHaveBeenCalled();
      expect(runtime.confirmFromUi).not.toHaveBeenCalled();
    }
    expect(JSON.stringify(result)).not.toContain("secret-ui-grant");
  },
);

it.each(["cancel", "decline"] as const)(
  "leaves a plan pending when the host dismisses a native dialog with %s",
  async (action) => {
    const { plan, runtime } = fixture();
    const server = harness(runtime);
    const client = new LegacyClient(
      { name: "dismissed-ui", version: "1.0.0" },
      { capabilities: { elicitation: { form: {} } } },
    );
    client.setRequestHandler(ElicitRequestSchema, async () => ({ action }));
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    cleanup.push(
      () => server.close(),
      () => client.close(),
    );
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({
      name: TOOL,
      arguments: { id: plan.id },
    });
    expect(result.isError).not.toBe(true);
    expect(plan.status).toBe("pending");
    expect(runtime.approvals.issue).not.toHaveBeenCalled();
    expect(runtime.confirmFromUi).not.toHaveBeenCalled();
  },
);

it("blocks clients without UI support and never issues an approval grant", async () => {
  const { plan, runtime } = fixture();
  const review = createNativeReview(runtime);
  const result = await review.request(
    plan,
    TOOL,
    { id: plan.id },
    {} as ServerContext,
    { inline: false, form: false },
  );
  expect(result).toMatchObject({ kind: "unavailable", uiUnavailable: true });
  expect(runtime.approvals.issue).not.toHaveBeenCalled();
  expect(runtime.confirmFromUi).not.toHaveBeenCalled();
});

it("rejects a plan changed while the native dialog was open", async () => {
  const { plan, runtime } = fixture();
  const server = harness(runtime);
  const client = new LegacyClient(
    { name: "legacy-ui", version: "1.0.0" },
    { capabilities: { elicitation: {} } },
  );
  client.setRequestHandler(ElicitRequestSchema, async () => {
    plan.hash = "0".repeat(64);
    return { action: "accept", content: { approve: true } };
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  cleanup.push(
    () => server.close(),
    () => client.close(),
  );
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const result = await client.callTool({
    name: TOOL,
    arguments: { id: plan.id },
  });
  expect(result.isError).toBe(true);
  expect(runtime.approvals.issue).not.toHaveBeenCalled();
  expect(runtime.confirmFromUi).not.toHaveBeenCalled();
  expect(plan.status).toBe("pending");
});

it.each(["arguments", "signature"])(
  "rejects a modern continuation with altered %s",
  async (tampering) => {
    const { plan, runtime } = fixture();
    const handler = createMcpHandler(() => harness(runtime));
    cleanup.push(() => handler.close());
    const client = new Client(
      { name: "modern-ui", version: "1.0.0" },
      {
        capabilities: { elicitation: { form: {} } },
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      },
    );
    client.setRequestHandler("elicitation/create", async () => ({
      action: "accept",
      content: { approve: true },
    }));
    cleanup.push(() => client.close());
    let altered = false;
    await client.connect(
      new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
        fetch: async (input, init) => {
          const request = new Request(input, init);
          const body = await request.clone().text();
          if (!body) return handler.fetch(request);
          const message = JSON.parse(body);
          if (message.params?.requestState) {
            altered = true;
            if (tampering === "arguments")
              message.params.arguments.id = randomUUID();
            else message.params.requestState += "tampered";
            return handler.fetch(
              new Request(request, { body: JSON.stringify(message) }),
            );
          }
          return handler.fetch(request);
        },
      }),
    );
    const result = await client
      .callTool({ name: TOOL, arguments: { id: plan.id } })
      .catch((error) => error);
    expect(altered).toBe(true);
    expect(result instanceof Error || result.isError === true).toBe(true);
    expect(runtime.approvals.issue).not.toHaveBeenCalled();
    expect(runtime.confirmFromUi).not.toHaveBeenCalled();
  },
);

it("preserves signed continuations across modern HTTP server instances", async () => {
  const { plan, runtime } = fixture();
  const factory = vi.fn(() => harness(runtime));
  const handler = createMcpHandler(factory);
  cleanup.push(() => handler.close());
  const client = new Client(
    { name: "modern-ui", version: "1.0.0" },
    {
      capabilities: { elicitation: { form: {} } },
      versionNegotiation: { mode: { pin: "2026-07-28" } },
    },
  );
  const dialog = vi.fn(async () => ({
    action: "accept" as const,
    content: { approve: true },
  }));
  client.setRequestHandler("elicitation/create", dialog);
  cleanup.push(() => client.close());
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => handler.fetch(new Request(input, init)),
    }),
  );
  const result = await client.callTool({
    name: TOOL,
    arguments: { id: plan.id },
  });
  expect(result.isError).not.toBe(true);
  expect(dialog, JSON.stringify(result)).toHaveBeenCalledOnce();
  expect(factory.mock.calls.length).toBeGreaterThan(1);
  expect(runtime.confirmFromUi).toHaveBeenCalledOnce();
  expect(plan.status).toBe("completed");
}, 15000);
