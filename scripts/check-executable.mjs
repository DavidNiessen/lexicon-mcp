import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

const executable = path.resolve(process.argv[2] || "");
if (!process.argv[2]) throw new Error("Pass an absolute executable path.");
const folder = await mkdtemp(path.join(tmpdir(), "lexicon-executable-"));
const child = spawn(executable, ["serve", "--transport", "stdio"], {
  cwd: folder,
  env: {
    ...process.env,
    PATH: "",
    NODE_PATH: "",
    LEXICON_DATA_DIR: path.join(folder, "data"),
    LEXICON_READ_ONLY: "true",
    LEXICON_BASE_URL: "http://127.0.0.1:1/v1",
  },
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
let diagnostics = "";
child.stderr.on("data", (chunk) => {
  diagnostics += chunk;
});
const pending = new Map();
let sequence = 0;
let failure;
const fail = (error) => {
  failure = error;
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer);
    reject(error);
  }
  pending.clear();
};
child.on("error", fail);
const exit = new Promise((resolve) =>
  child.once("exit", (code) => {
    if (pending.size)
      fail(new Error(`Executable exited (${code}): ${diagnostics}`));
    resolve(code);
  }),
);
const lines = createInterface({ input: child.stdout });
lines.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    fail(new Error("Executable wrote non-JSON data to stdout."));
    return;
  }
  assert.equal(message.jsonrpc, "2.0");
  if (!pending.has(message.id)) return;
  const { resolve, reject, timer } = pending.get(message.id);
  clearTimeout(timer);
  pending.delete(message.id);
  if (message.error) reject(new Error(JSON.stringify(message.error)));
  else resolve(message.result);
});
function request(method, params) {
  if (failure) return Promise.reject(failure);
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(
        new Error(`Executable timed out during ${method}: ${diagnostics}`),
      );
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
    );
  });
}
try {
  const initialized = await request("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "standalone-package-smoke", version: "1.0.0" },
  });
  assert.ok(initialized.serverInfo?.name);
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
  );
  const tools = await request("tools/list", {});
  assert.ok(tools.tools.length >= 35);
  const result = await request("tools/call", {
    name: "lexicon_get_command",
    arguments: { name: "AudioAnalyzer_Analyze" },
  });
  assert.notEqual(result.isError, true);
  assert.match(JSON.stringify(result), /parameterSchema/);
  assert.doesNotMatch(diagnostics, /SyntaxError|Cannot find module/);
  console.log(
    `Standalone executable MCP smoke passed: ${tools.tools.length} tools and command schema call; no live API access.`,
  );
} finally {
  child.stdin.end();
  const killTimer = setTimeout(() => child.kill(), 2000);
  await exit;
  clearTimeout(killTimer);
  lines.close();
  // Only the exact directory generated for this smoke test is removed.
  assert.ok(folder.startsWith(path.join(tmpdir(), "lexicon-executable-")));
  await rm(folder, { recursive: true, force: true });
}
