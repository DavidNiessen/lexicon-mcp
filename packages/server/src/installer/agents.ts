import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type Scope = "user" | "project";
export interface InstallerEnvironment {
  home?: string;
  cwd?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}
export interface AgentTarget {
  id: string;
  name: string;
  path: string;
  format: "jsonc" | "toml";
  key: "mcpServers" | "servers" | "mcp_servers";
  typeField: boolean;
}

export function agentTargets(
  scope: Scope,
  options: InstallerEnvironment = {},
): AgentTarget[] {
  const home = options.home ?? homedir(),
    cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env,
    platform = options.platform ?? process.platform;
  const support =
    platform === "win32"
      ? (env.APPDATA ?? join(home, "AppData", "Roaming"))
      : platform === "darwin"
        ? join(home, "Library", "Application Support")
        : (env.XDG_CONFIG_HOME ?? join(home, ".config"));
  const project = scope === "project";
  const targets: AgentTarget[] = [
    {
      id: "codex",
      name: "Codex",
      path: project
        ? join(cwd, ".codex", "config.toml")
        : join(
            env.CODEX_HOME
              ? resolve(home, env.CODEX_HOME)
              : join(home, ".codex"),
            "config.toml",
          ),
      format: "toml",
      key: "mcp_servers",
      typeField: false,
    },
    {
      id: "claude-code",
      name: "Claude Code",
      path: project ? join(cwd, ".mcp.json") : join(home, ".claude.json"),
      format: "jsonc",
      key: "mcpServers",
      typeField: true,
    },
    {
      id: "cursor",
      name: "Cursor",
      path: join(project ? cwd : home, ".cursor", "mcp.json"),
      format: "jsonc",
      key: "mcpServers",
      typeField: false,
    },
    {
      id: "vscode",
      name: "VS Code / Copilot",
      path: project
        ? join(cwd, ".vscode", "mcp.json")
        : join(support, "Code", "User", "mcp.json"),
      format: "jsonc",
      key: "servers",
      typeField: true,
    },
  ];
  if (!project && platform !== "linux")
    targets.splice(2, 0, {
      id: "claude-desktop",
      name: "Claude Desktop",
      path: join(support, "Claude", "claude_desktop_config.json"),
      format: "jsonc",
      key: "mcpServers",
      typeField: false,
    });
  return targets;
}

export function installerDataDir(options: InstallerEnvironment = {}) {
  const home = options.home ?? homedir(),
    env = options.env ?? process.env,
    platform = options.platform ?? process.platform;
  if (env.LEXICON_DATA_DIR) return resolve(env.LEXICON_DATA_DIR);
  return platform === "win32"
    ? join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "lexicon-mcp")
    : platform === "darwin"
      ? join(home, "Library", "Application Support", "lexicon-mcp")
      : join(env.XDG_DATA_HOME ?? join(home, ".local", "share"), "lexicon-mcp");
}
