import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { ApprovalManager } from "../src/approvals.js";
import { ChangePlans } from "../src/changes.js";
import { Store } from "../src/storage.js";
import { managementTools, Runtime } from "../src/runtime.js";

const folders: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    folders.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture(readOnly = false) {
  const directory = await mkdtemp(join(tmpdir(), "lexicon-ui-approval-"));
  folders.push(directory);
  let value = 1,
    writes = 0,
    now = Date.now();
  const plans = new ChangePlans(
    new Store(join(directory, "changes")),
    {
      snapshot: async () => ({ value }),
      execute: async () => {
        writes++;
        value++;
        return value;
      },
    },
    readOnly,
  );
  const manager = new ApprovalManager(
    new Store(join(directory, "approvals")),
    plans,
    { now: () => now },
  );
  const plan = await plans.create([{ tool: "edit", input: { id: 1 } }]);
  return {
    directory,
    manager,
    plans,
    plan,
    writes: () => writes,
    change: () => value++,
    expire: () => (now += 10 * 60 * 1000),
  };
}
it("issues a hidden credential without putting it in plans or storing plaintext", async () => {
  const f = await fixture();
  const grant = await f.manager.issue(f.plan.id, f.plan.hash);
  expect(grant.token).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(await f.plans.get(f.plan.id))).not.toContain(
    grant.token,
  );
  const persisted = await readFile(
    join(f.directory, "approvals", `grant-${f.plan.id}.json`),
    "utf8",
  );
  expect(persisted).not.toContain(grant.token);
  expect(JSON.parse(persisted).tokenHash).toMatch(/^[a-f0-9]{64}$/);
  expect(f.writes()).toBe(0);
});
it("binds credentials to the exact pending preview and invalidates older views", async () => {
  const f = await fixture();
  await expect(f.manager.issue(f.plan.id, "0".repeat(64))).rejects.toThrow(
    "exact pending",
  );
  const old = await f.manager.issue(f.plan.id, f.plan.hash);
  const current = await f.manager.issue(f.plan.id, f.plan.hash);
  await expect(
    f.manager.confirm({ ...old, decision: "apply" }),
  ).rejects.toThrow("Invalid UI");
  expect(
    (await f.manager.confirm({ ...current, decision: "apply" })).status,
  ).toBe("completed");
  await expect(f.manager.issue(f.plan.id, f.plan.hash)).rejects.toThrow(
    "exact pending",
  );
  expect(f.writes()).toBe(1);
});
it("rejects wrong credentials, hashes, invalid actions, and expiry without mutations", async () => {
  const f = await fixture();
  const grant = await f.manager.issue(f.plan.id, f.plan.hash);
  await expect(
    f.manager.confirm({ ...grant, token: "yes", decision: "apply" }),
  ).rejects.toThrow("Invalid UI");
  await expect(
    f.manager.confirm({ ...grant, hash: "0".repeat(64), decision: "apply" }),
  ).rejects.toThrow("Invalid UI");
  await expect(
    f.manager.confirm({ ...grant, decision: "yes" as any }),
  ).rejects.toThrow("Apply or Cancel");
  f.expire();
  await expect(
    f.manager.confirm({ ...grant, decision: "apply" }),
  ).rejects.toThrow("expired");
  expect(f.writes()).toBe(0);
});
it("applies once and returns a completed outcome when the same UI request is replayed", async () => {
  const f = await fixture();
  const grant = await f.manager.issue(f.plan.id, f.plan.hash);
  expect(
    (await f.manager.confirm({ ...grant, decision: "apply" })).status,
  ).toBe("completed");
  expect(
    (await f.manager.confirm({ ...grant, decision: "apply" })).status,
  ).toBe("completed");
  expect(f.writes()).toBe(1);
});
it("serializes concurrent clicks so a credential cannot duplicate writes", async () => {
  const f = await fixture();
  const grant = await f.manager.issue(f.plan.id, f.plan.hash);
  const outcomes = await Promise.allSettled([
    f.manager.confirm({ ...grant, decision: "apply" }),
    f.manager.confirm({ ...grant, decision: "apply" }),
  ]);
  expect(
    outcomes.some((result) => result.status === "fulfilled"),
    outcomes
      .map((result) =>
        result.status === "rejected"
          ? String(result.reason)
          : result.value.status,
      )
      .join("; "),
  ).toBe(true);
  expect(f.writes()).toBe(1);
});
it("cancels in the UI without writing and cannot later apply that preview", async () => {
  const f = await fixture();
  const grant = await f.manager.issue(f.plan.id, f.plan.hash);
  expect(
    (await f.manager.confirm({ ...grant, decision: "cancel" })).status,
  ).toBe("cancelled");
  expect(
    (await f.manager.confirm({ ...grant, decision: "cancel" })).status,
  ).toBe("cancelled");
  await expect(
    f.manager.confirm({ ...grant, decision: "apply" }),
  ).rejects.toThrow("already used");
  expect(f.writes()).toBe(0);
});
it("still checks stale previews and read-only policy after a valid UI action", async () => {
  const stale = await fixture();
  const grant = await stale.manager.issue(stale.plan.id, stale.plan.hash);
  stale.change();
  await expect(
    stale.manager.confirm({ ...grant, decision: "apply" }),
  ).rejects.toThrow("Stale plan");
  await expect(
    stale.manager.confirm({ ...grant, decision: "apply" }),
  ).rejects.toThrow("already used");
  expect(stale.writes()).toBe(0);
  const readonly = await fixture(true);
  const readonlyGrant = await readonly.manager.issue(
    readonly.plan.id,
    readonly.plan.hash,
  );
  await expect(
    readonly.manager.confirm({ ...readonlyGrant, decision: "apply" }),
  ).rejects.toThrow("Read-only");
  expect(readonly.writes()).toBe(0);
});
it("rejects model apply and cancellation even with a plan hash or literal yes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lexicon-runtime-ui-"));
  folders.push(directory);
  const runtime = new Runtime({
    dataDir: directory,
    baseUrl: "http://127.0.0.1:1/v1",
    port: 48625,
    readOnly: false,
  });
  await runtime.initialize();
  const request = vi
    .spyOn(runtime.client, "request")
    .mockResolvedValue({ track: { id: 1, rating: 1 } });
  const plan = await runtime.plans.create([
    { tool: "lexicon_update_track", input: { id: 1, edits: { rating: 2 } } },
  ]);
  const grant = await runtime.approvals.issue(plan.id, plan.hash);
  for (const name of [
    "lexicon_apply_change_plan",
    "lexicon_confirm_change_plan",
    "lexicon_cancel_change_plan",
  ])
    await expect(
      runtime.call(name, { ...grant, decision: "apply", confirmation: "yes" }),
    ).rejects.toThrow("explicit user approval");
  expect((await runtime.plans.get(plan.id)).status).toBe("pending");
  expect(
    managementTools.some((tool) => tool.name === "lexicon_cancel_change_plan"),
  ).toBe(false);
  expect(request.mock.calls.every(([method]) => method === "GET")).toBe(true);
  await runtime.jobs.close();
});
