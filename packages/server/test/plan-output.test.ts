import { expect, it } from "vitest";
import { compactPlanResult } from "../src/plan-output.js";
import type { Plan } from "../src/changes.js";

it("bounds a 117-track plan and supports later pages without exposing full snapshots or changing the plan", () => {
  const plan: Plan = {
    id: "d783b025-3215-4cfa-a447-3c5ef3379c9f",
    hash: "a".repeat(64),
    createdAt: new Date().toISOString(),
    status: "pending",
    outcomes: [],
    operations: Array.from({ length: 117 }, (_, i) => ({
      tool: "lexicon_update_track",
      input: { id: i + 1, edits: { tags: [183, 218] } },
    })),
    before: Array.from({ length: 117 }, (_, i) => ({
      track: {
        id: i + 1,
        title: `Synthetic ${i + 1}`,
        tags: [183],
        large: "x".repeat(10000),
      },
    })),
  };
  const before = JSON.stringify(plan);
  const first = compactPlanResult(plan, plan);
  expect(JSON.stringify(first).length).toBeLessThan(16000);
  expect(first.operationCount).toBe(117);
  expect(first.page.nextOffset).toBe(20);
  expect(first.rows).toHaveLength(20);
  expect(first.before).toBeUndefined();
  expect(first.operations).toBeUndefined();
  const last = compactPlanResult(plan, plan, 100, 20);
  expect(last.page.nextOffset).toBeUndefined();
  expect(last.rows).toHaveLength(17);
  expect(last.rows[0][0]).toContain("101");
  expect(JSON.stringify(plan)).toBe(before);
  plan.outcomes = [
    {
      index: 0,
      status: "completed",
      result: {
        status: "dispatched",
        completionObservable: false,
        large: "x".repeat(50000),
      },
    },
  ];
  const dispatched = compactPlanResult(plan, plan);
  expect(dispatched.outcomes[0].result).toEqual({
    status: "dispatched",
    completionObservable: false,
  });
  expect(JSON.stringify(dispatched).length).toBeLessThan(16000);
});
