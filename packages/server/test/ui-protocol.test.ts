import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer as createNetServer } from "node:net";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { expect, it, vi } from "vitest";
import { Runtime } from "../src/runtime.js";
import { serveHttp } from "../src/http.js";
import {
  PREVIEW_URI,
  PREVIEW_ALIASES,
  PREVIEW_MIME,
} from "../src/ui/document.js";

it("advertises UI resources and preserves text and structured results over MCP", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lexicon-ui-"));
  const runtime = new Runtime({
    baseUrl: "http://127.0.0.1:1/v1",
    dataDir: directory,
    httpToken: "x".repeat(64),
    port: 48625,
    readOnly: true,
  });
  await runtime.initialize();
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const server = await serveHttp(runtime, port);
  const client = new Client({ name: "ui-protocol-test", version: "1.0.0" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${port}/mcp`),
        {
          requestInit: {
            headers: { Authorization: `Bearer ${"x".repeat(64)}` },
          },
        },
      ),
    );
    const tools = await client.listTools();
    expect(
      tools.tools.find((tool) => tool.name === "lexicon_preview_change_plan")
        ?._meta,
    ).toMatchObject({ ui: { resourceUri: PREVIEW_URI } });
    const ui = await client.readResource({ uri: PREVIEW_URI });
    expect(ui.contents[0]?.mimeType).toBe(PREVIEW_MIME);
    expect(JSON.stringify(ui)).toContain("ui/initialize");
    for (const uri of PREVIEW_ALIASES) {
      const historical = await client.readResource({ uri });
      expect(historical.contents[0]?.uri).toBe(uri);
      expect(historical.contents[0]?.mimeType).toBe(PREVIEW_MIME);
      expect(JSON.stringify(historical)).toContain("setWidgetState");
    }
    const result = {
      findings: [{ trackId: 1, issue: "missing_metadata" }],
      total: 1,
      scanned: 1,
    };
    vi.spyOn(runtime, "call").mockResolvedValueOnce(result);
    const call = await client.callTool({
      name: "lexicon_library_health",
      arguments: {},
    });
    expect(call.isError).not.toBe(true);
    expect(call.structuredContent).toEqual({ result });
    expect(call.content).toContainEqual({
      type: "text",
      text: JSON.stringify({ result }),
    });
    expect(
      (call.content as any[]).some(
        (content) =>
          content.type === "resource" &&
          content.resource.mimeType === PREVIEW_MIME,
      ),
    ).toBe(true);
    expect(call._meta).toMatchObject({
      "lexicon/preview": { title: "Library health" },
    });
  } finally {
    await client.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}, 15000);
