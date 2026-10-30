import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer as createNetServer } from "node:net";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterEach, vi } from "vitest";
import { Runtime } from "../src/runtime.js";
import { serveHttp } from "../src/http.js";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const fn of cleanup.reverse()) await fn();
  cleanup.length = 0;
});
export async function connected(inline = false, modern = true, form = false) {
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
      capabilities: {
        ...(inline
          ? {
              [modern ? "extensions" : "experimental"]: {
                "io.modelcontextprotocol/ui": {
                  mimeTypes: ["text/html;profile=mcp-app"],
                },
              },
            }
          : {}),
        ...(form ? { elicitation: { form: {} } } : {}),
      },
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
