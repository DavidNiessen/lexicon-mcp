import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import type { AgentTarget } from "./agents.js";

export interface ConfigChange {
  target: AgentTarget;
  before: string | undefined;
  after: string;
  backup?: string;
}
export async function readConfig(path: string): Promise<string | undefined> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink())
      throw new Error(`Refusing to replace a symbolic-link config: ${path}`);
    if (!info.isFile() || info.size > 10_000_000)
      throw new Error(`Invalid or oversized configuration: ${path}`);
    return await readFile(path, "utf8");
  } catch (error: any) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}
export const fileHash = (value: string | undefined) =>
  value === undefined
    ? "missing"
    : createHash("sha256").update(value).digest("hex");
export async function applyConfig(change: ConfigChange) {
  if (
    fileHash(await readConfig(change.target.path)) !== fileHash(change.before)
  )
    throw new Error(
      `Configuration changed during installation: ${change.target.path}. Run the installer again.`,
    );
  await mkdir(dirname(change.target.path), { recursive: true, mode: 0o700 });
  const mode =
    change.before === undefined ? 0o600 : (await stat(change.target.path)).mode;
  const temporary = join(
    dirname(change.target.path),
    `.lexicon-${randomUUID()}.tmp`,
  );
  try {
    if (change.before !== undefined) {
      change.backup = `${change.target.path}.lexicon-backup-${Date.now()}-${randomUUID()}`;
      await writeFile(change.backup, change.before, {
        flag: "wx",
        mode: 0o600,
      });
    }
    await writeFile(temporary, change.after, { flag: "wx", mode });
    if (
      fileHash(await readConfig(change.target.path)) !== fileHash(change.before)
    )
      throw new Error(
        `Configuration changed while installing: ${change.target.path}`,
      );
    await rename(temporary, change.target.path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}
