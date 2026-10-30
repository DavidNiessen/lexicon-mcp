import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer as createNetServer } from "node:net";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterEach, expect, it, vi } from "vitest";
import { Runtime } from "../src/runtime.js";
import { serveHttp } from "../src/http.js";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const fn of cleanup.reverse()) await fn();
  cleanup.length = 0;
});
async function connected(inline = false, modern = true, form = false) {
  const dataDir = await mkdtemp(join(tmpdir(), "lexicon-mcp-approval-"));
  cleanup.push(() => rm(dataDir, { recursive: true, force: true }));
  const runtime = new Runtime({
    dataDir,
    baseUrl: "http://127.0.0.1:1/v1",
    port: 48625,
    readOnly: false,
    httpToken: "a".repeat(64),
  });
  await runtime.initialize();
  let writes = 0;
  const track = { id: 1, title: "Before", rating: 1 };
  vi.spyOn(runtime.client, "request").mockImplementation(
    async (method, _path, input: any) => {
      if (method !== "GET") {
        writes++;
        Object.assign(track, input.edits);
      }
      return { track: { ...track } } as any;
    },
  );
  const portProbe = createNetServer();
  await new Promise<void>((r) => portProbe.listen(0, "127.0.0.1", r));
  const port = (portProbe.address() as { port: number }).port;
  await new Promise<void>((r) => portProbe.close(() => r()));
  const server = await serveHttp(runtime, port);
  cleanup.push(() => new Promise<void>((r) => server.close(() => r())));
  const client = new Client(
    { name: "approval-protocol-test", version: "1.0.0" },
    {
      capabilities: inline
        ? {
            [modern ? "extensions" : "experimental"]: {
              "io.modelcontextprotocol/ui": {
                mimeTypes: ["text/html;profile=mcp-app"],
              },
            },
          }
        : form
          ? { elicitation: { form: {} } }
          : {},
      ...((inline || form) && modern
        ? { versionNegotiation: { mode: { pin: "2026-07-28" } } }
        : {}),
    } as any,
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${"a".repeat(64)}` } },
    }),
  );
  cleanup.push(() => client.close());
  return { runtime, client, writes: () => writes };
}
it("requires the UI-private credential and never exposes it to the model", async () => {
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
  const grant = (response._meta as any)?.["lexicon/approval"];
  expect(grant?.token).toHaveLength(64);
  expect(JSON.stringify(response.content)).not.toContain(grant.token);
  expect(JSON.stringify(response.structuredContent)).not.toContain(grant.token);
  const tools = await f.client.listTools();
  expect(tools.tools.some((t) => t.name === "lexicon_apply_change_plan")).toBe(
    false,
  );
  expect(
    tools.tools.find((t) => t.name === "lexicon_confirm_change_plan")?._meta,
  ).toMatchObject({ ui: { visibility: ["app"] } });
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
