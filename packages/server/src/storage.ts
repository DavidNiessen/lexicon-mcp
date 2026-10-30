import {
  mkdir,
  readFile,
  rename,
  writeFile,
  appendFile,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import lockfile from "proper-lockfile";

export class Store {
  constructor(readonly directory: string) {}
  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
  }
  path(id: string) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id))
      throw new Error("Invalid record identifier");
    return join(this.directory, `${id}.json`);
  }
  async read<T>(id: string): Promise<T> {
    return JSON.parse(await readFile(this.path(id), "utf8"));
  }
  async write(id: string, value: unknown) {
    await this.initialize();
    const target = this.path(id),
      temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temporary, target);
  }
  async exclusive<T>(run: () => Promise<T>): Promise<T> {
    await this.initialize();
    const release = await lockfile.lock(this.directory, {
      realpath: false,
      stale: 30000,
      retries: { retries: 40, minTimeout: 100, maxTimeout: 500 },
    });
    try {
      return await run();
    } finally {
      await release();
    }
  }
  async audit(value: Record<string, unknown>) {
    const path = join(this.directory, "audit.jsonl");
    try {
      if ((await stat(path)).size > 5_000_000)
        await rename(path, `${path}.previous`);
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
    }
    // Audit metadata excludes track text, paths, credentials and full request bodies.
    await appendFile(
      path,
      JSON.stringify({ at: new Date().toISOString(), ...value }) + "\n",
      { mode: 0o600 },
    );
  }
}
