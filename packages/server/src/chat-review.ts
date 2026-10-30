import { join } from "node:path";
import type { Plan } from "./changes.js";
import type { UiConfirmation, UiGrant } from "./approvals.js";
import { Store } from "./storage.js";

interface ChatRuntime {
  config: { dataDir: string; readOnly: boolean };
  plans: { get(id: string): Promise<Plan> };
  approvals: { issue(id: string, hash: string): Promise<UiGrant> };
  confirmFromUi(input: UiConfirmation): Promise<Plan>;
}
type Decision = "apply" | "cancel";
type ReviewMarker = {
  id: string;
  hash: string;
  expiresAt: number;
  state: "open" | "deciding" | "resolved" | "failed";
  decision?: Decision;
};
export type ChatDecision = {
  id: string;
  hash: string;
  decision: Decision;
  confirmed: true;
};

/** A plan-bound assistant question using native chat choices or a plain reply.
 * The assistant relays actual user consent; this server cannot read the transcript.
 */
export class ChatReview {
  constructor(
    private readonly runtime: ChatRuntime,
    private readonly store = new Store(
      join(runtime.config.dataDir, "chat-reviews"),
    ),
    private readonly options: { now?: () => number; ttlMs?: number } = {},
  ) {}

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  async open(plan: Plan) {
    return this.store.exclusive(async () => {
      const current = await this.runtime.plans.get(plan.id);
      if (current.hash !== plan.hash || current.status !== "pending")
        throw new Error("Only the exact pending plan can open chat review.");
      const expiresAt = this.now() + (this.options.ttlMs ?? 10 * 60 * 1000);
      await this.store.write(plan.id, {
        id: plan.id,
        hash: plan.hash,
        expiresAt,
        state: "open",
      } satisfies ReviewMarker);
      return {
        id: plan.id,
        hash: plan.hash,
        expiresAt: new Date(expiresAt).toISOString(),
      };
    });
  }

  async decide(input: ChatDecision): Promise<Plan> {
    if (input.confirmed !== true)
      throw new Error("Explicit user chat confirmation is required.");
    if (input.decision !== "apply" && input.decision !== "cancel")
      throw new Error("Chat review must choose apply or cancel.");
    if (this.runtime.config.readOnly)
      throw new Error("Read-only mode prohibits chat decisions.");
    return this.store.exclusive(async () => {
      let marker: ReviewMarker;
      try {
        marker = await this.store.read<ReviewMarker>(input.id);
      } catch (error: any) {
        if (error.code === "ENOENT")
          throw new Error(
            "Open this saved plan for review before confirming in chat.",
          );
        throw error;
      }
      const plan = await this.runtime.plans.get(input.id);
      if (
        marker.id !== input.id ||
        marker.hash !== input.hash ||
        plan.hash !== input.hash
      )
        throw new Error(
          "Chat confirmation does not match the reviewed plan hash.",
        );
      const expected = input.decision === "apply" ? "completed" : "cancelled";
      if (marker.decision === input.decision && plan.status === expected)
        return plan;
      if (plan.status !== "pending")
        throw new Error(
          "Plan requires reconciliation; chat decisions cannot replay it.",
        );
      if (marker.state !== "open")
        throw new Error(
          "Previous chat decision did not complete; reopen review before retrying.",
        );
      if (!Number.isFinite(marker.expiresAt) || this.now() >= marker.expiresAt)
        throw new Error("Chat review expired; reopen this plan for review.");
      marker.state = "deciding";
      marker.decision = input.decision;
      await this.store.write(input.id, marker);
      try {
        const grant = await this.runtime.approvals.issue(input.id, input.hash);
        const result = await this.runtime.confirmFromUi({
          ...grant,
          decision: input.decision,
        });
        if (
          result.id !== input.id ||
          result.hash !== input.hash ||
          result.status === "pending"
        )
          throw new Error(
            "Chat decision outcome is inconsistent; inspect the saved plan.",
          );
        marker.state = result.status === expected ? "resolved" : "failed";
        await this.store.write(input.id, marker);
        return result;
      } catch (error) {
        marker.state = "failed";
        await this.store.write(input.id, marker);
        throw error;
      }
    });
  }
}
