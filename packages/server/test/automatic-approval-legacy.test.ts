import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { Runtime } from "../src/runtime.js";
import { createServer } from "../src/mcp.js";

it("automatically requests native approval through the legacy handshake even when Claude advertises Apps", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "lexicon-native-legacy-"));
  const runtime = new Runtime({
    dataDir,
    baseUrl: "http://127.0.0.1:1/v1",
    port: 48625,
    readOnly: false,
    approvalUi: "native",
  });
  await runtime.initialize();
  let writes = 0;
  const track = { id: 1, rating: 1 };
  vi.spyOn(runtime.client, "request").mockImplementation(
    async (method, _path, input: any) => {
      if (method !== "GET") {
        writes++;
        Object.assign(track, input.edits);
      }
      return { track: { ...track } } as any;
    },
  );
  const server = createServer(runtime);
  const client = new Client(
    { name: "claude-code", version: "test" },
    {
      capabilities: {
        elicitation: {},
        experimental: {
          "io.modelcontextprotocol/ui": {
            mimeTypes: ["text/html;profile=mcp-app"],
          },
        },
      },
    },
  );
  const dialog = vi.fn(async () => ({
    action: "accept" as const,
    content: { approve: true },
  }));
  client.setRequestHandler(ElicitRequestSchema, dialog);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport as any);
    const plan = await runtime.plans.create([
      { tool: "lexicon_update_track", input: { id: 1, edits: { rating: 2 } } },
    ]);
    const response = await client.callTool({
      name: "lexicon_review_change_plan",
      arguments: { id: plan.id },
    });
    expect(response.isError).not.toBe(true);
    expect(dialog).toHaveBeenCalledOnce();
    expect(writes).toBe(1);
    expect((response.structuredContent as any).result.status).toBe("completed");
    expect(response._meta?.["lexicon/approval"]).toBeUndefined();
    expect(response._meta?.["lexicon/preview"]).toBeUndefined();
    expect(
      (response.content as any[]).some((item) => item.type === "resource"),
    ).toBe(false);
  } finally {
    await client.close();
    await server.close();
    vi.restoreAllMocks();
    await rm(dataDir, { recursive: true, force: true });
  }
});
