import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  access,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { parse as parseJsonc } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";
import {
  runInstaller,
  agentTargets,
  type InstallOptions,
} from "../src/installer/index.js";
import { applyConfig } from "../src/installer/files.js";
import { updateEntry } from "../src/installer/formats.js";

const folders: string[] = [];
async function fixture(): Promise<InstallOptions> {
  const home = await mkdtemp(join(tmpdir(), "lexicon-installer-"));
  folders.push(home);
  const bundlePath = join(home, "source.cjs");
  await writeFile(bundlePath, 'console.log("synthetic bundle");\n');
  return {
    home,
    cwd: join(home, "project with spaces"),
    dataDir: join(home, "server data"),
    env: {},
    platform: "win32",
    bundlePath,
    yes: true,
    log: () => undefined,
  };
}
async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
it("resolves native paths and honors the Codex configuration root", async () => {
  const options = await fixture();
  const targets = agentTargets("user", {
    ...options,
    env: {
      CODEX_HOME: join(options.home!, "custom codex"),
      COPILOT_HOME: join(options.home!, "custom copilot"),
    },
  });
  expect(targets.find((t) => t.id === "codex")!.path).toBe(
    join(options.home!, "custom codex", "config.toml"),
  );
  expect(targets.find((t) => t.id === "vscode")!.path).toBe(
    join(options.home!, "AppData", "Roaming", "Code", "User", "mcp.json"),
  );
  expect(targets.find((t) => t.id === "claude-desktop")!.path).toContain(
    join("AppData", "Roaming", "Claude", "claude_desktop_config.json"),
  );
  expect(
    agentTargets("project", options).find((t) => t.id === "vscode")!.path,
  ).toBe(join(options.cwd!, ".vscode", "mcp.json"));
  expect(
    agentTargets("project", options).some((t) => t.id === "claude-desktop"),
  ).toBe(false);
  expect(
    agentTargets("user", { ...options, platform: "darwin" }).find(
      (t) => t.id === "claude-desktop",
    )!.path,
  ).toContain(join("Library", "Application Support", "Claude"));
});
it("dry-run performs no runtime/config/directory writes and prints no existing secrets", async () => {
  const options = await fixture(),
    target = agentTargets("user", options).find((t) => t.id === "cursor")!;
  await mkdir(dirname(target.path), { recursive: true });
  const original =
    '{"mcpServers":{"other":{"env":{"TOKEN":"secret-from-existing-config"}}}}';
  await writeFile(target.path, original);
  const output: string[] = [];
  const result = await runInstaller({
    ...options,
    agents: ["codex", "cursor"],
    dryRun: true,
    log: (line) => output.push(line),
  });
  expect(result.status).toBe("preview");
  expect(await exists(options.dataDir!)).toBe(false);
  expect(await readFile(target.path, "utf8")).toBe(original);
  expect(await readdir(dirname(target.path))).toEqual(["mcp.json"]);
  expect(output.join("\n")).not.toContain("secret-from-existing-config");
  expect(await exists(agentTargets("user", options)[0]!.path)).toBe(false);
});
it("installs multiple agents, preserves comments and unrelated entries, and backs up config", async () => {
  const options = await fixture();
  const targets = agentTargets("user", options),
    codex = targets.find((t) => t.id === "codex")!,
    cursor = targets.find((t) => t.id === "cursor")!;
  await mkdir(dirname(codex.path), { recursive: true });
  await mkdir(dirname(cursor.path), { recursive: true });
  const toml =
    '# preference comment\nmodel = "chosen-model"\n\n[mcp_servers.other]\ncommand = "other-server"\n';
  const json =
    '// keep this comment\n{"mcpServers":{"other":{"command":"other-server"}},"custom":true}\n';
  await writeFile(codex.path, toml);
  await writeFile(cursor.path, json);
  const result = await runInstaller({
    ...options,
    agents: ["codex,cursor", "claude-code", "vscode"],
  });
  expect(result.status).toBe("installed");
  expect(result.changes).toHaveLength(4);
  expect(await readFile(result.runtimePath, "utf8")).toBe(
    await readFile(options.bundlePath, "utf8"),
  );
  const afterToml = await readFile(codex.path, "utf8"),
    afterJson = await readFile(cursor.path, "utf8");
  expect(afterToml).toContain("# preference comment");
  expect(afterJson).toContain("// keep this comment");
  const parsedToml = parseToml(afterToml) as any;
  expect(parsedToml.model).toBe("chosen-model");
  expect(parsedToml.mcp_servers.other.command).toBe("other-server");
  expect(parsedToml.mcp_servers.lexicon.command).toBe(process.execPath);
  expect(parsedToml.mcp_servers.lexicon.args).toEqual([
    result.runtimePath,
    "serve",
    "--transport",
    "stdio",
  ]);
  expect(parseJsonc(afterJson).custom).toBe(true);
  expect(
    await readFile(
      result.changes.find((c) => c.agent === "codex")!.backup!,
      "utf8",
    ),
  ).toBe(toml);
  expect(
    await readFile(
      result.changes.find((c) => c.agent === "cursor")!.backup!,
      "utf8",
    ),
  ).toBe(json);
  expect(JSON.stringify(parsedToml)).not.toContain("autoApprove");
});
it("rejects malformed configs before writing any selected config or runtime", async () => {
  const options = await fixture(),
    target = agentTargets("user", options).find((t) => t.id === "cursor")!;
  await mkdir(dirname(target.path), { recursive: true });
  await writeFile(target.path, '{"broken": ');
  await expect(
    runInstaller({ ...options, agents: ["codex", "cursor"] }),
  ).rejects.toThrow("Invalid JSON");
  expect(await exists(options.dataDir!)).toBe(false);
  expect(await exists(agentTargets("user", options)[0]!.path)).toBe(false);
});
it("requires explicit force for a conflicting server, including in dry runs", async () => {
  const options = await fixture(),
    target = agentTargets("user", options).find((t) => t.id === "cursor")!;
  await mkdir(dirname(target.path), { recursive: true });
  await writeFile(
    target.path,
    '{"mcpServers":{"lexicon":{"command":"different-server"},"other":{"command":"keep"}}}',
  );
  await expect(
    runInstaller({ ...options, agents: ["cursor"] }),
  ).rejects.toThrow("--force");
  const result = await runInstaller({
    ...options,
    agents: ["cursor"],
    force: true,
  });
  expect(
    parseJsonc(await readFile(target.path, "utf8")).mcpServers.other.command,
  ).toBe("keep");
  expect(result.changes[0]!.backup).toBeTruthy();
});
it("updates its own runtime without forcing and can remove only its own entry", async () => {
  const options = await fixture();
  await runInstaller({ ...options, agents: ["codex", "cursor"] });
  const repeat = await runInstaller({
    ...options,
    agents: ["codex", "cursor"],
  });
  expect(repeat.changes.every((change) => !change.changed)).toBe(true);
  const result = await runInstaller({
    ...options,
    agents: ["codex", "cursor"],
    uninstall: true,
  });
  expect(result.status).toBe("removed");
  expect(await exists(result.runtimePath)).toBe(true);
  const cursor = agentTargets("user", options).find((t) => t.id === "cursor")!;
  expect(
    parseJsonc(await readFile(cursor.path, "utf8")).mcpServers.lexicon,
  ).toBeUndefined();
  const codex = agentTargets("user", options).find((t) => t.id === "codex")!;
  expect(
    (parseToml(await readFile(codex.path, "utf8")) as any).mcp_servers?.lexicon,
  ).toBeUndefined();
});
it("detects concurrent config edits and leaves the latest contents intact", async () => {
  const options = await fixture(),
    target = agentTargets("user", options).find((t) => t.id === "cursor")!;
  await mkdir(dirname(target.path), { recursive: true });
  await writeFile(target.path, '{"fresh":true}');
  await expect(
    applyConfig({ target, before: "{}", after: '{"new":true}' }),
  ).rejects.toThrow("changed during installation");
  expect(await readFile(target.path, "utf8")).toBe('{"fresh":true}');
});
it("preserves user-added read-only environment settings when updating an owned server", async () => {
  const options = await fixture();
  await runInstaller({ ...options, agents: ["codex", "cursor"] });
  const targets = agentTargets("user", options),
    codex = targets.find((t) => t.id === "codex")!,
    cursor = targets.find((t) => t.id === "cursor")!;
  const codexSource = (await readFile(codex.path, "utf8")).replace(
    /^command = .*$/m,
    'command = "node"',
  );
  await writeFile(
    codex.path,
    `${codexSource}\n[mcp_servers.lexicon.env]\nLEXICON_READ_ONLY = "true"\nLEXICON_HTTP_TOKEN = "synthetic-codex-token"\n`,
  );
  const cursorConfig = parseJsonc(await readFile(cursor.path, "utf8"));
  cursorConfig.mcpServers.lexicon.command = "node";
  cursorConfig.mcpServers.lexicon.env = {
    LEXICON_READ_ONLY: "true",
    LEXICON_HTTP_TOKEN: "synthetic-cursor-token",
  };
  await writeFile(cursor.path, JSON.stringify(cursorConfig, null, 2));
  const output: string[] = [];
  await runInstaller({
    ...options,
    agents: ["codex", "cursor"],
    dryRun: true,
    log: (line) => output.push(line),
  });
  expect(output.join("\n")).not.toContain("synthetic-codex-token");
  expect(output.join("\n")).not.toContain("synthetic-cursor-token");
  expect(output.join("\n")).toContain("[redacted]");
  await runInstaller({ ...options, agents: ["codex", "cursor"] });
  expect(
    (parseToml(await readFile(codex.path, "utf8")) as any).mcp_servers.lexicon
      .env.LEXICON_READ_ONLY,
  ).toBe("true");
  expect(
    parseJsonc(await readFile(cursor.path, "utf8")).mcpServers.lexicon.env
      .LEXICON_READ_ONLY,
  ).toBe("true");
  expect(
    (parseToml(await readFile(codex.path, "utf8")) as any).mcp_servers.lexicon
      .env.LEXICON_HTTP_TOKEN,
  ).toBe("synthetic-codex-token");
  expect(
    parseJsonc(await readFile(cursor.path, "utf8")).mcpServers.lexicon.env
      .LEXICON_HTTP_TOKEN,
  ).toBe("synthetic-cursor-token");
});
it("refuses unsupported scope/agent selections and unsafe TOML layouts", async () => {
  const options = await fixture();
  await expect(
    runInstaller({ ...options, scope: "project", agents: ["claude-desktop"] }),
  ).rejects.toThrow("Unsupported agent");
  const target = agentTargets("user", options).find((t) => t.id === "codex")!;
  expect(() =>
    updateEntry('mcp_servers = { lexicon = { command = "other" } }\n', target, {
      command: "node",
      args: [],
    }),
  ).toThrow("inline");
  expect(() =>
    updateEntry('mcp_servers = "invalid"\n', target, {
      command: "node",
      args: [],
    }),
  ).toThrow("Expected an object");
});
