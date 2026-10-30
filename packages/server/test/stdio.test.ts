import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import { expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client as LegacyClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport as LegacyTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

it("supports current and legacy stdio SDK clients with clean protocol output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lexicon-stdio-"));
  try {
    const entry = join(dir, "cli.cjs");
    await build({
      entryPoints: ["packages/server/src/cli.ts"],
      outfile: entry,
      bundle: true,
      format: "cjs",
      mainFields: ["module", "main"],
      platform: "node",
      target: "node24",
      logLevel: "silent",
    });
    const env = {
      ...process.env,
      LEXICON_DATA_DIR: join(dir, "data"),
      LEXICON_READ_ONLY: "true",
    } as Record<string, string>;
    for (const legacy of [false, true]) {
      const client = legacy
        ? new LegacyClient({ name: "legacy-test", version: "1.0.0" })
        : new Client({ name: "modern-test", version: "1.0.0" });
      const Transport = legacy ? LegacyTransport : StdioClientTransport;
      const transport = new Transport({
        command: process.execPath,
        args: [entry, "serve"],
        env,
        stderr: "pipe",
      });
      let errors = "";
      transport.stderr?.on("data", (chunk) => {
        errors += chunk;
      });
      try {
        await client.connect(transport as any);
        const tools = await client.listTools();
        expect(tools.tools.length).toBeGreaterThan(35);
        const result = await client.callTool({
          name: "lexicon_get_command",
          arguments: { name: "AudioAnalyzer_Analyze" },
        });
        expect(result.isError).not.toBe(true);
        expect(JSON.stringify(result)).toContain("parameterSchema");
      } finally {
        await client.close();
      }
      expect(errors).not.toContain("SyntaxError");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 20000);
