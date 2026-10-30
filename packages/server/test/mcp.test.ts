import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { Runtime } from "../src/runtime.js";
import { serveHttp } from "../src/http.js";
import { createServer } from "node:net";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const run of cleanup.reverse()) await run();
  cleanup.length = 0;
});
it("serves tool schemas, calls, resources and prompts through an authenticated SDK client", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lexicon-mcp-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const token = "x".repeat(64);
  const runtime = new Runtime({
    baseUrl: "http://127.0.0.1:48624/v1",
    dataDir: directory,
    httpToken: token,
    port: 48625,
    readOnly: true,
  });
  await runtime.initialize();
  // Reserve an available local test port, then hand it to the HTTP server.
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((r) => probe.close(() => r()));
  const server = await serveHttp(runtime, port);
  cleanup.push(() => new Promise<void>((r) => server.close(() => r())));
  const client = new Client({ name: "integration-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${port}/mcp`),
    { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
  );
  cleanup.push(() => client.close());
  await client.connect(transport);
  const tools = await client.listTools();
  expect(tools.tools.length).toBeGreaterThan(35);
  const result = await client.callTool({
    name: "lexicon_list_commands",
    arguments: { query: "AudioAnalyzer" },
  });
  expect(result.isError).not.toBe(true);
  expect(JSON.stringify(result)).toContain("AudioAnalyzer_Analyze");
  const resources = await client.listResources();
  expect(
    resources.resources.some((r) => r.uri === "lexicon://capabilities"),
  ).toBe(true);
  const resource = await client.readResource({ uri: "lexicon://capabilities" });
  expect(resource.contents.length).toBe(1);
  const prompts = await client.listPrompts();
  expect(prompts.prompts).toHaveLength(3);
  const prompt = await client.getPrompt({ name: "lexicon_metadata_cleanup" });
  expect(prompt.messages).toHaveLength(1);
  const denied = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
  });
  expect(denied.status).toBe(401);
}, 15000);
