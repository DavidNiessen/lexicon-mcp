import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { ChangePlans, Plan } from "./changes.js";
import { Store } from "./storage.js";

export type UiGrant = {
  id: string;
  hash: string;
  token: string;
  expiresAt: string;
};
export type UiConfirmation = {
  id: string;
  hash: string;
  token: string;
  decision: "apply" | "cancel";
};
type GrantRecord = {
  id: string;
  hash: string;
  tokenHash: string;
  expiresAt: number;
  used: boolean;
  decision?: UiConfirmation["decision"];
};
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/** A UI-only credential is never part of a plan or model-visible tool content. */
export class ApprovalManager {
  constructor(
    private readonly store: Store,
    private readonly plans: ChangePlans,
    private readonly options: { ttlMs?: number; now?: () => number } = {},
  ) {}

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  async initialize() {
    await this.store.initialize();
  }

  async issue(id: string, hash: string): Promise<UiGrant> {
    return this.store.exclusive(async () => {
      const plan = await this.plans.get(id);
      if (plan.status !== "pending" || plan.hash !== hash)
        throw new Error(
          "Only the exact pending preview can receive UI approval.",
        );
      const token = randomBytes(32).toString("hex");
      const expiresAt = this.now() + (this.options.ttlMs ?? 10 * 60 * 1000);
      await this.store.write(`grant-${id}`, {
        id,
        hash,
        tokenHash: tokenHash(token),
        expiresAt,
        used: false,
      } satisfies GrantRecord);
      return { id, hash, token, expiresAt: new Date(expiresAt).toISOString() };
    });
  }

  async confirm(input: UiConfirmation): Promise<Plan> {
    if (!["apply", "cancel"].includes(input.decision))
      throw new Error("UI confirmation must choose Apply or Cancel.");
    const ready = await this.store.exclusive(async () => {
      const record = await this.store.read<GrantRecord>(`grant-${input.id}`);
      const supplied = tokenHash(String(input.token));
      if (
        record.id !== input.id ||
        record.hash !== input.hash ||
        !timingSafeEqual(Buffer.from(record.tokenHash), Buffer.from(supplied))
      )
        throw new Error("Invalid UI approval credential.");
      if (this.now() >= record.expiresAt)
        throw new Error("UI approval expired. Reopen the pending preview.");
      const plan = await this.plans.get(input.id);
      if (plan.hash !== input.hash)
        throw new Error("UI approval does not match the preview.");
      if (record.used) {
        if (record.decision === input.decision && plan.status !== "pending")
          return { plan };
        throw new Error("UI approval was already used. Reopen the preview.");
      }
      if (plan.status !== "pending")
        throw new Error("Only a pending preview can be confirmed.");
      record.used = true;
      record.decision = input.decision;
      await this.store.write(`grant-${input.id}`, record);
      return { plan: undefined };
    });
    if (ready.plan) return ready.plan;
    // The approval lock is separate from the change lock and released before writes.
    return input.decision === "apply"
      ? this.plans.apply(input.id, input.hash)
      : this.plans.cancel(input.id);
  }
}
