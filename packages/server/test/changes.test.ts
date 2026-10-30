import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ChangePlans } from "../src/changes.js";
import { Store } from "../src/storage.js";
import { authorized } from "../src/http.js";

const directories: string[] = [];
async function fixture(readOnly = false) {
  const directory = await mkdtemp(join(tmpdir(), "lexicon-plans-"));
  directories.push(directory);
  const store = new Store(directory);
  let value = 1,
    writes = 0;
  const executor = {
    snapshot: async () => ({ value }),
    execute: async () => {
      writes++;
      value++;
      return value;
    },
  };
  return {
    plans: new ChangePlans(store, executor, readOnly),
    store,
    change: () => value++,
    writes: () => writes,
  };
}
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
describe("reviewed change plans", () => {
  it("previews without writing and applies once across repeated calls", async () => {
    const f = await fixture();
    const plan = await f.plans.create([{ tool: "edit", input: { id: 1 } }]);
    expect(f.writes()).toBe(0);
    expect((await f.plans.apply(plan.id, plan.hash)).status).toBe("completed");
    await f.plans.apply(plan.id, plan.hash);
    expect(f.writes()).toBe(1);
  });
  it("rejects stale data and wrong hashes without writes", async () => {
    const f = await fixture();
    const plan = await f.plans.create([{ tool: "edit", input: { id: 1 } }]);
    await expect(f.plans.apply(plan.id, "bad")).rejects.toThrow("hash");
    f.change();
    await expect(f.plans.apply(plan.id, plan.hash)).rejects.toThrow("Stale");
    expect(f.writes()).toBe(0);
  });
  it("blocks apply in read-only mode and after cancellation", async () => {
    const f = await fixture(true);
    const plan = await f.plans.create([{ tool: "edit", input: { id: 1 } }]);
    await expect(f.plans.apply(plan.id, plan.hash)).rejects.toThrow(
      "Read-only",
    );
    const g = await fixture();
    const p = await g.plans.create([{ tool: "edit", input: { id: 1 } }]);
    await g.plans.cancel(p.id);
    await expect(g.plans.apply(p.id, p.hash)).rejects.toThrow("reconciliation");
  });
  it("records partial outcomes and prevents ambiguous failure replay", async () => {
    const f = await fixture();
    let writes = 0;
    const plans = new ChangePlans(f.store, {
      snapshot: async () => 1,
      execute: async () => {
        if (++writes === 2) throw new Error("timeout");
        return 1;
      },
    });
    const p = await plans.create([
      { tool: "edit", input: {} },
      { tool: "edit", input: {} },
    ]);
    const result = await plans.apply(p.id, p.hash);
    expect(result.status).toBe("failed");
    expect(result.outcomes).toHaveLength(2);
    await expect(plans.apply(p.id, p.hash)).rejects.toThrow("reconciliation");
    expect(writes).toBe(2);
  });
  it("treats an interrupted applying record as requiring reconciliation", async () => {
    const f = await fixture();
    const p = await f.plans.create([{ tool: "edit", input: {} }]);
    p.status = "applying";
    await f.store.write(p.id, p);
    await expect(f.plans.apply(p.id, p.hash)).rejects.toThrow("reconciliation");
    expect((await f.plans.get(p.id)).status).toBe("interrupted");
  });
});
it("requires HTTP authentication and prevents hostile host and origin headers", () => {
  const token = "a".repeat(64),
    headers = { host: "127.0.0.1:48625", authorization: `Bearer ${token}` };
  expect(authorized({ headers }, token, 48625)).toBe(200);
  expect(
    authorized(
      { headers: { ...headers, host: "attacker.example" } },
      token,
      48625,
    ),
  ).toBe(403);
  expect(
    authorized(
      { headers: { ...headers, origin: "https://attacker.example" } },
      token,
      48625,
    ),
  ).toBe(403);
  expect(
    authorized(
      { headers: { ...headers, authorization: "Bearer wrong" } },
      token,
      48625,
    ),
  ).toBe(401);
});
