import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { WorkflowContext } from "./types.js";

type JobState =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";
interface Job {
  id: string;
  name: string;
  input: unknown;
  state: JobState;
  createdAt: string;
  updatedAt: string;
  progress?: { completed: number; total?: number };
  error?: string;
  ownerPid?: number;
}
type Runner = (context: WorkflowContext) => Promise<unknown>;

export class JobManager {
  private readonly controllers = new Map<string, AbortController>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly active = new Map<string, Job>();

  constructor(private readonly directory: string) {}

  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const file of await readdir(this.directory)) {
      if (!file.endsWith(".job.json")) continue;
      const job = JSON.parse(
        await readFile(join(this.directory, file), "utf8"),
      ) as Job;
      if (job.state === "running" && !this.ownerAlive(job.ownerPid)) {
        job.state = "interrupted";
        job.error =
          "Server stopped before completion. Start a new inspection job; no automatic replay occurred.";
        job.updatedAt = new Date().toISOString();
        await this.save(job);
      }
    }
  }

  async start(name: string, input: unknown, runner: Runner): Promise<Job> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const now = new Date().toISOString();
    const job: Job = {
      id: randomUUID(),
      name,
      input,
      state: "running",
      createdAt: now,
      updatedAt: now,
      ownerPid: process.pid,
    };
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    this.active.set(job.id, job);
    await this.save(job);
    const task = this.execute(job, runner, controller);
    this.pending.set(job.id, task);
    void task.finally(() => this.pending.delete(job.id)).catch(() => undefined);
    return { ...job };
  }

  async status(id: string): Promise<Job> {
    const active = this.active.get(id);
    if (active) return { ...active };
    return JSON.parse(await readFile(this.path(id, "job"), "utf8")) as Job;
  }

  async results(id: string, offset = 0, limit = 100): Promise<unknown> {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1000
    )
      throw new Error("Invalid result pagination");
    const job = await this.status(id);
    if (job.state !== "completed")
      return { id, state: job.state, error: job.error };
    const result = JSON.parse(
      await readFile(this.path(id, "result"), "utf8"),
    ) as unknown;
    if (Array.isArray(result))
      return {
        id,
        total: result.length,
        offset,
        limit,
        items: result.slice(offset, offset + limit),
      };
    if (result && typeof result === "object") {
      const paged: Record<string, unknown> = {};
      const totals: Record<string, number> = {};
      for (const [key, value] of Object.entries(result)) {
        if (Array.isArray(value)) {
          paged[key] = value.slice(offset, offset + limit);
          totals[key] = value.length;
        } else paged[key] = value;
      }
      return { id, offset, limit, arrayTotals: totals, result: paged };
    }
    return { id, result };
  }

  async cancel(id: string): Promise<Job> {
    const job = await this.status(id);
    if (job.state !== "running") return job;
    const controller = this.controllers.get(id);
    if (!controller)
      throw new Error(
        "Job belongs to a different process or has been interrupted",
      );
    controller.abort(new Error("Job cancelled by user"));
    await this.pending.get(id);
    return this.status(id);
  }

  async close(): Promise<void> {
    for (const controller of this.controllers.values())
      controller.abort(new Error("Server shutting down"));
    await Promise.all(this.pending.values());
  }

  private async execute(
    job: Job,
    runner: Runner,
    controller: AbortController,
  ): Promise<void> {
    try {
      const result = await runner({
        signal: controller.signal,
        progress: (completed, total) => {
          job.progress = { completed, total };
        },
      });
      controller.signal.throwIfAborted();
      await this.atomicWrite(this.path(job.id, "result"), result);
      job.state = "completed";
    } catch (error) {
      job.state = controller.signal.aborted ? "cancelled" : "failed";
      job.error = error instanceof Error ? error.message : String(error);
    } finally {
      job.updatedAt = new Date().toISOString();
      try {
        await this.save(job);
      } finally {
        this.controllers.delete(job.id);
        this.active.delete(job.id);
      }
    }
  }

  private path(id: string, kind: "job" | "result"): string {
    if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id))
      throw new Error("Invalid job ID");
    return join(this.directory, `${id}.${kind}.json`);
  }

  private save(job: Job): Promise<void> {
    return this.atomicWrite(this.path(job.id, "job"), job);
  }

  private ownerAlive(pid: number | undefined): boolean {
    if (!pid) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "EPERM";
    }
  }

  private async atomicWrite(path: string, value: unknown): Promise<void> {
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value), {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, path);
  }
}
