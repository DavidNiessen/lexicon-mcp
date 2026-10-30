import { createHash, randomUUID } from "node:crypto";
import { Store } from "./storage.js";

export type Operation = { tool: string; input: Record<string, any> };
type Executor = {
  execute(op: Operation): Promise<unknown>;
  snapshot(op: Operation): Promise<unknown>;
  prepare?(op: Operation): Promise<Operation>;
};
export type Plan = {
  id: string;
  hash: string;
  createdAt: string;
  status:
    | "pending"
    | "applying"
    | "completed"
    | "failed"
    | "cancelled"
    | "interrupted";
  operations: Operation[];
  before: unknown[];
  outcomes: {
    index: number;
    status: string;
    result?: unknown;
    error?: string;
  }[];
};
export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class ChangePlans {
  constructor(
    private store: Store,
    private executor: Executor,
    private readOnly = false,
  ) {}
  async create(operations: Operation[]) {
    if (!operations.length || operations.length > 1000)
      throw new Error("A plan requires 1–1000 operations");
    const resolved: Operation[] = [],
      before: unknown[] = [];
    for (const raw of operations) {
      const op = this.executor.prepare ? await this.executor.prepare(raw) : raw;
      resolved.push(op);
      before.push(await this.executor.snapshot(op));
    }
    const plan: Plan = {
      id: randomUUID(),
      hash: digest({ operations: resolved, before }),
      createdAt: new Date().toISOString(),
      status: "pending",
      operations: resolved,
      before,
      outcomes: [],
    };
    await this.store.write(plan.id, plan);
    return plan;
  }
  get(id: string) {
    return this.store.read<Plan>(id);
  }
  async cancel(id: string) {
    return this.store.exclusive(async () => {
      const plan = await this.get(id);
      if (plan.status !== "pending")
        throw new Error("Only pending plans can be cancelled");
      plan.status = "cancelled";
      await this.store.write(id, plan);
      return plan;
    });
  }
  async apply(id: string, hash: string) {
    if (this.readOnly)
      throw new Error("Read-only mode prohibits applying changes");
    return this.store.exclusive(async () => {
      const plan = await this.get(id);
      if (
        plan.hash !== hash ||
        digest({ operations: plan.operations, before: plan.before }) !== hash
      )
        throw new Error("Plan hash does not match");
      if (plan.status === "completed") return plan;
      if (plan.status === "applying") {
        plan.status = "interrupted";
        await this.store.write(id, plan);
      }
      if (plan.status !== "pending")
        throw new Error("Plan requires reconciliation; it cannot be replayed");
      if (Date.now() - Date.parse(plan.createdAt) > 24 * 60 * 60 * 1000)
        throw new Error("Plan expired; create a fresh preview");
      for (let i = 0; i < plan.operations.length; i++) {
        if (
          digest(await this.executor.snapshot(plan.operations[i]!)) !==
          digest(plan.before[i])
        )
          throw new Error(
            `Stale plan at operation ${i}; generate a new preview`,
          );
      }
      plan.status = "applying";
      await this.store.write(id, plan);
      for (let i = 0; i < plan.operations.length; i++) {
        try {
          const result = await this.executor.execute(plan.operations[i]!);
          plan.outcomes.push({ index: i, status: "completed", result });
          await this.store.write(id, plan);
          await this.store.audit({
            planId: id,
            index: i,
            tool: plan.operations[i]!.tool,
            status: "completed",
          });
        } catch (error) {
          plan.outcomes.push({
            index: i,
            status: "failed-or-unknown",
            error: error instanceof Error ? error.message : "Operation failed",
          });
          plan.status = "failed";
          await this.store.write(id, plan);
          await this.store.audit({
            planId: id,
            index: i,
            status: "failed-or-unknown",
          });
          return plan;
        }
      }
      plan.status = "completed";
      await this.store.write(id, plan);
      return plan;
    });
  }
}
