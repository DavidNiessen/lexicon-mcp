import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import * as prompts from "@clack/prompts";
import { VERSION } from "../version.js";
import {
  agentTargets,
  installerDataDir,
  type InstallerEnvironment,
  type Scope,
} from "./agents.js";
import { existingEntry, updateEntry, type ServerEntry } from "./formats.js";
import { applyConfig, readConfig, type ConfigChange } from "./files.js";

export { agentTargets } from "./agents.js";
export type { Scope, AgentTarget } from "./agents.js";
export interface InstallOptions extends InstallerEnvironment {
  agents?: string[];
  scope?: Scope;
  dryRun?: boolean;
  force?: boolean;
  yes?: boolean;
  uninstall?: boolean;
  bundlePath: string;
  dataDir?: string;
  log?: (message: string) => void;
}
export interface InstallResult {
  status: "installed" | "removed" | "preview" | "cancelled";
  runtimePath: string;
  changes: { agent: string; path: string; changed: boolean; backup?: string }[];
}
const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
function previewEntry(entry: unknown) {
  return JSON.stringify(entry, (key, value) =>
    key === "env" && value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value).map((name) => [name, "[redacted]"]),
        )
      : value,
  );
}
function owned(entry: unknown, runtimeRoot: string): boolean {
  if (!entry || typeof entry !== "object") return false;
  const args = (entry as { args?: unknown }).args;
  return (
    Array.isArray(args) &&
    typeof args[0] === "string" &&
    isAbsolute(args[0]) &&
    resolve(args[0]).startsWith(resolve(runtimeRoot) + sep) &&
    args.includes("serve")
  );
}
async function persistRuntime(bundlePath: string, target: string) {
  const source = await readFile(resolve(bundlePath));
  try {
    if ((await lstat(target)).isSymbolicLink())
      throw new Error("Runtime path is a symbolic link");
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, source, { mode: 0o700, flag: "wx" });
    await rename(temporary, target);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export async function runInstaller(
  options: InstallOptions,
): Promise<InstallResult> {
  const log = options.log ?? console.log;
  const runtimeRoot = join(
    options.dataDir ?? installerDataDir(options),
    "runtime",
  );
  const runtimePath = join(runtimeRoot, VERSION, "cli.cjs");
  const cancelled = (): InstallResult => ({
    status: "cancelled",
    runtimePath,
    changes: [],
  });
  let scope = options.scope;
  let ids = options.agents
    ?.flatMap((id) => id.split(","))
    .map((id) => id.trim())
    .filter(Boolean);
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (scope !== undefined && !["user", "project"].includes(scope))
    throw new Error("Scope must be user or project");
  if (!scope && interactive && !options.yes) {
    prompts.intro(
      options.uninstall ? "Remove Lexicon MCP" : "Install Lexicon MCP",
    );
    const result = await prompts.select({
      message: "Where should Lexicon MCP be available?",
      options: [
        { value: "user", label: "All projects for your user" },
        { value: "project", label: "This project only" },
      ],
    });
    if (prompts.isCancel(result)) return cancelled();
    scope = result as Scope;
  }
  scope ??= "user";
  const targets = agentTargets(scope, options);
  if (!ids?.length) {
    if (!interactive || options.yes)
      throw new Error(
        "Select agents with --agent codex --agent cursor (or run in an interactive terminal).",
      );
    const result = await prompts.multiselect({
      message: "Which agents should use Lexicon MCP?",
      options: targets.map((target) => ({
        value: target.id,
        label: target.name,
      })),
      required: true,
    });
    if (prompts.isCancel(result)) return cancelled();
    ids = result as string[];
  }
  const selected = [...new Set(ids)].map((id) => {
    const target = targets.find((target) => target.id === id);
    if (!target)
      throw new Error(
        `Unsupported agent "${id}" for ${scope} scope. Available: ${targets.map((target) => target.id).join(", ")}`,
      );
    return target;
  });
  const changes: ConfigChange[] = [];
  const results: InstallResult["changes"] = [];
  for (const target of selected) {
    const before = await readConfig(target.path),
      existing = existingEntry(before ?? "", target);
    const managed = owned(existing, runtimeRoot);
    const entry: ServerEntry = {
      ...(managed ? (existing as Record<string, unknown>) : {}),
      ...(target.typeField ? { type: "stdio" } : {}),
      command: process.execPath,
      args: [runtimePath, "serve", "--transport", "stdio"],
    };
    if (
      existing !== undefined &&
      !same(existing, entry) &&
      !managed &&
      !options.force
    )
      throw new Error(
        `Agent ${target.name} already has a different lexicon server. Use --force to replace it after reviewing --dry-run.`,
      );
    const after = options.uninstall
      ? existing === undefined
        ? (before ?? "")
        : updateEntry(before ?? "", target, undefined)
      : updateEntry(before ?? "", target, entry);
    const changed = after !== (before ?? "");
    results.push({ agent: target.id, path: target.path, changed });
    if (changed) changes.push({ target, before, after });
    log(
      `${options.uninstall ? "Remove" : "Configure"} ${target.name}: ${target.path}${changed ? "" : " (already configured)"}`,
    );
  }
  if (!options.uninstall) log(`Server runtime: ${runtimePath}`);
  if (options.dryRun) {
    for (const change of changes)
      log(
        `Preview ${change.target.path}: ${options.uninstall ? "remove lexicon entry" : previewEntry(existingEntry(change.after, change.target))}`,
      );
    log("Dry run: no files were written.");
    return { status: "preview", runtimePath, changes: results };
  }
  if (!options.yes) {
    if (!interactive)
      throw new Error(
        "Non-interactive installation requires --yes. Use --dry-run to preview.",
      );
    const confirmed = await prompts.confirm({
      message: `${options.uninstall ? "Remove" : "Install"} Lexicon MCP for ${selected.length} selected agent(s)?`,
      initialValue: true,
    });
    if (prompts.isCancel(confirmed) || !confirmed) return cancelled();
  }
  if (!options.uninstall) await persistRuntime(options.bundlePath, runtimePath);
  for (const change of changes) {
    await applyConfig(change);
    results.find((result) => result.path === change.target.path)!.backup =
      change.backup;
    if (change.backup) log(`Backup: ${change.backup}`);
  }
  log(
    options.uninstall
      ? "Lexicon MCP entries removed. Shared runtime files are retained for other agents."
      : "Lexicon MCP installed. Restart your selected agents, then enable the Local API in Lexicon.",
  );
  return {
    status: options.uninstall ? "removed" : "installed",
    runtimePath,
    changes: results,
  };
}
