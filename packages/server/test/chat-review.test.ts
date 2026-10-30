import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { ChatReview } from "../src/chat-review.js";
import { ChangePlans } from "../src/changes.js";
import { ApprovalManager } from "../src/approvals.js";
import { Store } from "../src/storage.js";

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture(readOnly = false) {
  const dataDir = await mkdtemp(join(tmpdir(), "lexicon-chat-review-"));
  folders.push(dataDir);
  let value = 1,
    writes = 0,
    now = Date.now();
  const plans = new ChangePlans(
    new Store(join(dataDir, "changes")),
    {
      snapshot: async () => ({ value }),
      execute: async () => {
        writes++;
        return ++value;
      },
    },
    readOnly,
  );
  const manager = new ApprovalManager(
    new Store(join(dataDir, "approvals")),
    plans,
    { now: () => now },
  );
  const runtime = {
    config: { dataDir, readOnly },
    plans,
    approvals: {
      issue: vi.fn((id: string, hash: string) => manager.issue(id, hash)),
    },
    confirmFromUi: vi.fn((input: Parameters<typeof manager.confirm>[0]) =>
      manager.confirm(input),
    ),
  };
  const plan = await plans.create([
    { tool: "synthetic-edit", input: { id: 1 } },
  ]);
  const create = () => new ChatReview(runtime, undefined, { now: () => now });
  return {
    dataDir,
    runtime,
    plan,
    chat: create(),
    create,
    writes: () => writes,
    change: () => value++,
    expire: () => (now += 600_000),
  };
}
const decision = (
  f: Awaited<ReturnType<typeof fixture>>,
  action: "apply" | "cancel" = "apply",
) => ({
  id: f.plan.id,
  hash: f.plan.hash,
  decision: action,
  confirmed: true as const,
});

it("requires a saved review and an explicit true confirmation before issuing grants", async () => {
  const f = await fixture();
  await expect(f.chat.decide(decision(f))).rejects.toThrow(
    "Open this saved plan",
  );
  await f.chat.open(f.plan);
  await expect(
    f.chat.decide({ ...decision(f), confirmed: false as any }),
  ).rejects.toThrow("Explicit user");
  expect(f.runtime.approvals.issue).not.toHaveBeenCalled();
  expect(f.writes()).toBe(0);
});

it("persists a bounded review marker across instances without exposing a grant", async () => {
  const f = await fixture();
  const opened = await f.chat.open(f.plan);
  expect(opened).toEqual({
    id: f.plan.id,
    hash: f.plan.hash,
    expiresAt: expect.any(String),
  });
  expect(f.runtime.approvals.issue).not.toHaveBeenCalled();
  const stored = await readFile(
    join(f.dataDir, "chat-reviews", `${f.plan.id}.json`),
    "utf8",
  );
  expect(stored).not.toContain("token");
  const applied = await f.create().decide(decision(f));
  expect(applied.status).toBe("completed");
  expect(f.writes()).toBe(1);
  const grant = await f.runtime.approvals.issue.mock.results[0]!.value;
  expect(JSON.stringify(applied)).not.toContain(grant.token);
});

it("rejects wrong hashes and expired reviews before issuing any grant", async () => {
  const f = await fixture();
  await f.chat.open(f.plan);
  await expect(
    f.chat.decide({ ...decision(f), hash: "0".repeat(64) }),
  ).rejects.toThrow("hash");
  f.expire();
  await expect(f.chat.decide(decision(f))).rejects.toThrow("expired");
  expect(f.runtime.approvals.issue).not.toHaveBeenCalled();
  expect(f.writes()).toBe(0);
});

it("serializes duplicate approvals and returns completion without another write", async () => {
  const f = await fixture();
  await f.chat.open(f.plan);
  const results = await Promise.all([
    f.chat.decide(decision(f)),
    f.create().decide(decision(f)),
  ]);
  expect(results.map((result) => result.status)).toEqual([
    "completed",
    "completed",
  ]);
  f.expire();
  expect((await f.chat.decide(decision(f))).status).toBe("completed");
  expect(f.runtime.approvals.issue).toHaveBeenCalledOnce();
  expect(f.writes()).toBe(1);
  await expect(f.chat.decide(decision(f, "cancel"))).rejects.toThrow(
    "reconciliation",
  );
});

it("cancels an exact reviewed plan without writing and safely replays cancellation", async () => {
  const f = await fixture();
  await f.chat.open(f.plan);
  expect((await f.chat.decide(decision(f, "cancel"))).status).toBe("cancelled");
  expect((await f.create().decide(decision(f, "cancel"))).status).toBe(
    "cancelled",
  );
  expect(f.runtime.approvals.issue).toHaveBeenCalledOnce();
  expect(f.writes()).toBe(0);
});

it("blocks chat decisions in read-only mode", async () => {
  const f = await fixture(true);
  await f.chat.open(f.plan);
  await expect(f.chat.decide(decision(f))).rejects.toThrow("Read-only");
  expect(f.runtime.approvals.issue).not.toHaveBeenCalled();
  expect(f.writes()).toBe(0);
});

it("preserves stale precondition checks and blocks automatic retry after an error", async () => {
  const f = await fixture();
  await f.chat.open(f.plan);
  f.change();
  await expect(f.chat.decide(decision(f))).rejects.toThrow("Stale plan");
  await expect(f.create().decide(decision(f))).rejects.toThrow("reopen review");
  expect(f.writes()).toBe(0);
  expect(f.runtime.approvals.issue).toHaveBeenCalledOnce();
});

it("refuses to open a changed or already resolved plan", async () => {
  const f = await fixture();
  await expect(
    f.chat.open({ ...f.plan, hash: "0".repeat(64) }),
  ).rejects.toThrow("exact pending");
  await f.runtime.plans.cancel(f.plan.id);
  await expect(f.chat.open(f.plan)).rejects.toThrow("exact pending");
  expect(f.writes()).toBe(0);
});
