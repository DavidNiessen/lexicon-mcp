import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { runInstaller } from "../src/installer/index.js";

it("launches the installed server through an agent config after its npx source disappears", async () => {
  const home = await mkdtemp(join(tmpdir(), "lexicon-installed runtime-"));
  try {
    const source = join(home, "ephemeral-npx", "cli.cjs");
    await build({
      entryPoints: ["packages/server/src/cli.ts"],
      outfile: source,
      bundle: true,
      platform: "node",
      format: "cjs",
      mainFields: ["module", "main"],
      target: "node24",
      logLevel: "silent",
    });
    const result = await runInstaller({
      home,
      cwd: home,
      env: {},
      platform: process.platform,
      bundlePath: source,
      dataDir: join(home, "app data"),
      agents: ["cursor"],
      yes: true,
      log: () => undefined,
    });
    const config = JSON.parse(await readFile(result.changes[0]!.path, "utf8"))
      .mcpServers.lexicon;
    await rm(join(home, "ephemeral-npx"), { recursive: true, force: true });
    const client = new Client({
      name: "installed-runtime-test",
      version: "1.0.0",
    });
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: {
        ...process.env,
        LEXICON_DATA_DIR: join(home, "test-server-data"),
        LEXICON_BASE_URL: "http://127.0.0.1:1/v1",
        LEXICON_READ_ONLY: "true",
      } as Record<string, string>,
      stderr: "pipe",
    });
    let stderr = "";
    transport.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.length).toBeGreaterThan(35);
      const command = await client.callTool({
        name: "lexicon_get_command",
        arguments: { name: "AudioAnalyzer_Analyze" },
      });
      expect(command.isError).not.toBe(true);
      expect(JSON.stringify(command)).toContain("parameterSchema");
    } catch (error) {
      throw new Error(`Installed server failed: ${stderr}`, { cause: error });
    } finally {
      await client.close();
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}, 20000);
