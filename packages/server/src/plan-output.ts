import type { Plan } from "./changes.js";
import { previewFor } from "./ui/model.js";

/** Model output is a bounded display, never the authoritative mutation input. */
export function compactPlanResult(
  result: any,
  plan: Plan,
  offset = 0,
  limit = 20,
) {
  const operations = plan.operations.slice(offset, offset + limit);
  const preview = previewFor({
    ...plan,
    operations,
    before: plan.before.slice(offset, offset + limit),
    outcomes: [],
  });
  const rows: string[][] = [];
  let size = 0;
  for (const row of preview?.rows ?? []) {
    const bytes = JSON.stringify(row).length;
    if (size + bytes > 8000) break;
    rows.push(row);
    size += bytes;
  }
  const summary = {
    id: plan.id,
    hash: plan.hash,
    createdAt: plan.createdAt,
    status: plan.status,
    operationCount: plan.operations.length,
    outcomeCount: plan.outcomes.length,
    page: {
      offset,
      limit,
      returned: operations.length,
      ...(offset + operations.length < plan.operations.length
        ? { nextOffset: offset + operations.length }
        : {}),
    },
    columns: preview?.columns ?? [],
    rows,
    outcomes: plan.outcomes.slice(offset, offset + limit).map((outcome) => ({
      index: outcome.index,
      status: outcome.status,
      ...((outcome.result as any)?.completionObservable === false
        ? { result: { status: "dispatched", completionObservable: false } }
        : {}),
      ...(outcome.error ? { error: outcome.error.slice(0, 500) } : {}),
    })),
    note: "Bounded display values. Approval covers every operation in this exact saved plan. Full operations and precondition snapshots remain on the server. Use lexicon_get_change_plan with offset/limit for another page.",
  };
  return result.plan
    ? { ...result, plan: summary }
    : { ...(result.review ? { review: result.review } : {}), ...summary };
}
