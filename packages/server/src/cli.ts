import { parseArgs } from "node:util";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadConfig, initializeConfig } from "./config.js";
import { Runtime } from "./runtime.js";
import { createServer } from "./mcp.js";
import { serveHttp } from "./http.js";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      transport: { type: "string", default: "stdio" },
      port: { type: "string" },
      version: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.version) {
    console.log("0.1.0");
    return;
  }
  if (values.help || !positionals.length) {
    console.log(
      "lexicon-mcp serve [--transport stdio|http] [--port 48625]\nlexicon-mcp doctor\nlexicon-mcp config init|show\nEnvironment: LEXICON_BASE_URL, LEXICON_DATA_DIR, LEXICON_HTTP_TOKEN, LEXICON_READ_ONLY",
    );
    return;
  }
  let config = await loadConfig();
  if (positionals[0] === "config") {
    if (positionals[1] === "init") {
      config = await initializeConfig(config);
      console.log(
        `Configuration initialized at ${config.dataDir}. Read config.json locally to configure HTTP client credentials.`,
      );
    } else
      console.log(
        JSON.stringify(
          {
            ...config,
            httpToken: config.httpToken ? "[configured]" : undefined,
          },
          null,
          2,
        ),
      );
    return;
  }
  const runtime = new Runtime(config);
  if (positionals[0] === "doctor") {
    const status = await runtime.client.health();
    console.log(
      JSON.stringify(
        { version: "0.1.0", node: process.version, ...status },
        null,
        2,
      ),
    );
    return;
  }
  if (positionals[0] !== "serve")
    throw new Error("Unknown command; use --help");
  await runtime.initialize();
  if (values.transport === "stdio") {
    await serveStdio(() => createServer(runtime));
    return;
  }
  if (values.transport !== "http")
    throw new Error("Transport must be stdio or http");
  const port = Number(values.port ?? config.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid port");
  const server = await serveHttp(runtime, port);
  console.error(`Lexicon MCP listening at http://127.0.0.1:${port}/mcp`);
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => server.close());
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Startup failed");
  process.exitCode = 1;
});
