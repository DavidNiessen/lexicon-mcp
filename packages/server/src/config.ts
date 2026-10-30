import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { z } from "zod";

export const configSchema = z.object({
  baseUrl: z.string().url().default("http://127.0.0.1:48624/v1"),
  dataDir: z.string(),
  httpToken: z.string().min(32).optional(),
  port: z.number().int().min(1024).max(65535).default(48625),
  readOnly: z.boolean().default(false),
  exportDir: z.string().optional(),
});
export type Config = z.infer<typeof configSchema>;
export function defaultDataDir() {
  return (
    process.env.LEXICON_DATA_DIR ??
    (process.platform === "win32"
      ? join(
          process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
          "lexicon-mcp",
        )
      : process.platform === "darwin"
        ? join(homedir(), "Library", "Application Support", "lexicon-mcp")
        : join(
            process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
            "lexicon-mcp",
          ))
  );
}
export async function loadConfig(): Promise<Config> {
  const dataDir = defaultDataDir();
  let saved = {};
  try {
    saved = JSON.parse(await readFile(join(dataDir, "config.json"), "utf8"));
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }
  const config = configSchema.parse({
    ...saved,
    dataDir,
    ...(process.env.LEXICON_BASE_URL
      ? { baseUrl: process.env.LEXICON_BASE_URL }
      : {}),
    ...(process.env.LEXICON_HTTP_TOKEN
      ? { httpToken: process.env.LEXICON_HTTP_TOKEN }
      : {}),
    ...(process.env.LEXICON_READ_ONLY === "true" ? { readOnly: true } : {}),
  });
  const url = new URL(config.baseUrl);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.protocol !== "http:" ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Lexicon upstream must be a loopback HTTP address without credentials",
    );
  }
  return config;
}
export async function initializeConfig(config: Config) {
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
  const next = {
    ...config,
    httpToken: config.httpToken ?? randomBytes(32).toString("hex"),
  };
  await writeFile(
    join(config.dataDir, "config.json"),
    JSON.stringify(next, null, 2),
    { mode: 0o600 },
  );
  return next;
}
