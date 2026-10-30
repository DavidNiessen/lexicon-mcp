import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { Runtime } from "../src/runtime.js";
import { ExportService, WorkflowService } from "../src/workflows/index.js";
import { createSimulator } from "./simulator.js";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "lexicon-playlist-plans-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const simulator = await createSimulator({
    tracks: [
      { id: 1, title: "One" },
      { id: 2, title: "Two" },
    ],
    playlists: [{ id: 7, name: "Original", type: "2", trackIds: [1, 2, 1] }],
  });
  cleanups.push(simulator.close);
  const runtime = new Runtime({
    dataDir: directory,
    baseUrl: simulator.baseUrl,
    port: 48625,
    readOnly: false,
  });
  await runtime.initialize();
  cleanups.push(() => runtime.jobs.close());
  return { directory, simulator, runtime };
}

it("applies a UI-confirmed reorder against the stateful API and preserves duplicate occurrences", async () => {
  const { simulator, runtime } = await fixture();
  const proposal = (await runtime.workflows.run("lexicon_playlist_workflow", {
    action: "reorder",
    playlistIds: [7],
    trackIds: [2, 1, 1],
  })) as { operations: { tool: string; input: Record<string, unknown> }[] };
  const plan = await runtime.plans.create(proposal.operations);
  expect(simulator.state.playlists.get(7)!.trackIds).toEqual([1, 2, 1]);
  const grant = await runtime.approvals.issue(plan.id, plan.hash);
  const result = await runtime.confirmFromUi({ ...grant, decision: "apply" });
  expect(result.status).toBe("completed");
  expect(simulator.state.playlists.get(7)!.trackIds).toEqual([2, 1, 1]);
  const writes = simulator.requests.filter(
    (request) => request.method !== "GET",
  ).length;
  await runtime.confirmFromUi({ ...grant, decision: "apply" });
  expect(
    simulator.requests.filter((request) => request.method !== "GET"),
  ).toHaveLength(writes);
});

it("records an interrupted reorder and recovers only through a fresh reviewed plan", async () => {
  const { simulator, runtime } = await fixture();
  const proposal = (await runtime.workflows.run("lexicon_playlist_workflow", {
    action: "reorder",
    playlistIds: [7],
    trackIds: [2, 1, 1],
  })) as { operations: { tool: string; input: Record<string, unknown> }[] };
  const plan = await runtime.plans.create(proposal.operations);
  simulator.failNext({
    status: 400,
    errorCode: 5,
    message: "Simulated insertion failure",
    method: "PATCH",
    path: "/playlist-tracks",
  });
  const grant = await runtime.approvals.issue(plan.id, plan.hash);
  const failed = await runtime.confirmFromUi({ ...grant, decision: "apply" });
  expect(failed.status).toBe("failed");
  expect(failed.outcomes.map((outcome) => outcome.status)).toEqual([
    "completed",
    "failed-or-unknown",
  ]);
  expect(simulator.state.playlists.get(7)!.trackIds).toEqual([]);
  const attempts = simulator.requests.filter(
    (request) => request.method !== "GET",
  ).length;
  expect(
    (await runtime.confirmFromUi({ ...grant, decision: "apply" })).status,
  ).toBe("failed");
  expect(
    simulator.requests.filter((request) => request.method !== "GET"),
  ).toHaveLength(attempts);
  await expect(runtime.approvals.issue(plan.id, plan.hash)).rejects.toThrow(
    "pending",
  );
  const original = (failed.before[0] as { playlist: { trackIds: number[] } })
    .playlist.trackIds;
  const recovery = await runtime.plans.create([
    {
      tool: "lexicon_add_playlist_tracks",
      input: { id: 7, trackIds: original, index: 0 },
    },
  ]);
  const recoveryGrant = await runtime.approvals.issue(
    recovery.id,
    recovery.hash,
  );
  expect(
    (await runtime.confirmFromUi({ ...recoveryGrant, decision: "apply" }))
      .status,
  ).toBe("completed");
  expect(simulator.state.playlists.get(7)!.trackIds).toEqual([1, 2, 1]);
});

it("copies current tracks through two explicit reviewed plans and reports the incomplete intermediate state", async () => {
  const { simulator, runtime } = await fixture();
  const proposal = (await runtime.workflows.run("lexicon_playlist_workflow", {
    action: "copy",
    playlistIds: [7],
    name: "Copy",
  })) as {
    operations: { tool: string; input: Record<string, unknown> }[];
    followUp: { tool: string; trackIds: number[] };
    copyMode: string;
    note: string;
  };
  expect(proposal.note).toContain("incomplete");
  const creation = await runtime.plans.create(proposal.operations);
  const creationGrant = await runtime.approvals.issue(
    creation.id,
    creation.hash,
  );
  const created = await runtime.confirmFromUi({
    ...creationGrant,
    decision: "apply",
  });
  const newId = (created.outcomes[0]!.result as { id: number }).id;
  expect(simulator.state.playlists.get(newId)!.trackIds).toEqual([]);
  const population = await runtime.plans.create([
    {
      tool: proposal.followUp.tool,
      input: { id: newId, trackIds: proposal.followUp.trackIds },
    },
  ]);
  const populationGrant = await runtime.approvals.issue(
    population.id,
    population.hash,
  );
  await runtime.confirmFromUi({ ...populationGrant, decision: "apply" });
  expect(simulator.state.playlists.get(newId)).toMatchObject({
    name: "Copy",
    trackIds: [1, 2, 1],
  });
});

it("exports the primary collection of a workflow report as CSV", async () => {
  const { directory, runtime } = await fixture();
  const reports = join(directory, "exports");
  await mkdir(reports);
  const report = await new WorkflowService(runtime.client).run(
    "lexicon_library_health",
    {},
  );
  const outputPath = join(reports, "health.csv");
  const exported = await new ExportService(reports).write(
    "csv",
    outputPath,
    report,
  );
  expect(exported.collection).toBe("findings");
  const csv = await readFile(outputPath, "utf8");
  expect(csv).toContain("trackId");
  expect(csv).toContain("missing_metadata");
});
