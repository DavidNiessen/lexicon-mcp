import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LexiconClient } from "../src/lexicon/client.js";
import { JobManager, WorkflowService } from "../src/workflows/index.js";
import { createSimulator } from "./simulator.js";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("large and stateful library scenarios", () => {
  it("scans a million generated tracks in 500-item pages while retaining only the requested findings", async () => {
    const total = 1_000_000;
    let maximumPage = 0;
    let calls = 0;
    const progress: number[] = [];
    const client = {
      async request(
        _method: string,
        path: string,
        input: Record<string, unknown> = {},
      ) {
        if (path === "/tags") return { tags: [], categories: [] };
        if (path === "/playlists") return { playlists: [] };
        expect(path).toBe("/tracks");
        const offset = Number(input.offset);
        const limit = Number(input.limit);
        maximumPage = Math.max(maximumPage, limit);
        calls++;
        return {
          total,
          tracks: Array.from(
            { length: Math.min(limit, total - offset) },
            (_, index) => ({ id: offset + index + 1, tags: [] }),
          ),
        };
      },
    };
    const report = (await new WorkflowService(client).run(
      "lexicon_library_health",
      { limit: 7, offset: 3000 },
      { progress: (completed) => progress.push(completed) },
    )) as { scanned: number; findings: unknown[]; total: number };
    expect(report.scanned).toBe(total);
    expect(report.total).toBe(total * 3);
    expect(report.findings).toHaveLength(7);
    expect(maximumPage).toBe(500);
    expect(calls).toBe(2000);
    expect(progress.at(-1)).toBe(total);
  }, 15000);

  it("reports index truncation and bounds IDs returned for huge duplicate groups", async () => {
    const client = {
      async request(
        _method: string,
        _path: string,
        input: Record<string, unknown> = {},
      ) {
        const offset = Number(input.offset);
        const limit = Number(input.limit);
        return {
          total: 100001,
          tracks: Array.from(
            { length: Math.min(limit, 100001 - offset) },
            (_, index) => ({ id: offset + index + 1, fingerprint: "same" }),
          ),
        };
      },
    };
    const result = (await new WorkflowService(client).run(
      "lexicon_find_duplicates",
      {},
    )) as {
      scanned: number;
      truncated: boolean;
      candidates: {
        trackIds: number[];
        trackCount: number;
        truncatedTrackIds: boolean;
      }[];
    };
    expect(result.scanned).toBe(100000);
    expect(result.truncated).toBe(true);
    expect(result.candidates[0]).toMatchObject({
      trackCount: 100000,
      truncatedTrackIds: true,
    });
    expect(result.candidates[0]!.trackIds).toHaveLength(1000);
  });

  it("checks taxonomy definitions and assignments against real HTTP adapter responses", async () => {
    const simulator = await createSimulator({
      tracks: [{ id: 1, title: " ", artist: "A", tags: [1, 1, 999] }],
      tags: [
        { id: 1, label: "Techno", categoryId: 3, position: 0 },
        { id: 2, label: " techno ", categoryId: 99, position: 0 },
      ],
      categories: [{ id: 3, label: "Genre", position: 0, tags: [1, 999] }],
    });
    cleanups.push(simulator.close);
    const service = new WorkflowService(
      new LexiconClient({ baseUrl: simulator.baseUrl }),
    );
    const result = (await service.run("lexicon_library_health", {})) as {
      counts: Record<string, number>;
    };
    expect(result.counts).toMatchObject({
      duplicate_tag_label: 1,
      unknown_tag_category: 1,
      unknown_category_tag: 1,
      unknown_tag_assignment: 1,
      duplicate_tag_assignment: 1,
      missing_metadata: 1,
    });
    expect(
      simulator.requests.every((request) => request.method === "GET"),
    ).toBe(true);
  });

  it("applies an explicitly chosen cleanup proposal to a disposable simulated library", async () => {
    const simulator = await createSimulator({
      tracks: [{ id: 4, artist: " A ", title: " T " }],
    });
    cleanups.push(simulator.close);
    const client = new LexiconClient({ baseUrl: simulator.baseUrl });
    const proposal = (await new WorkflowService(client).run(
      "lexicon_cleanup_metadata",
      { trackIds: [4] },
    )) as { operations: { input: Record<string, unknown> }[] };
    expect(simulator.state.tracks.get(4)!.title).toBe(" T ");
    await client.request("PATCH", "/track", proposal.operations[0]!.input);
    expect(simulator.state.tracks.get(4)!.title).toBe("T");
  });

  it("exports the complete job result independently of client pagination", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lexicon-jobs-"));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const manager = new JobManager(directory);
    const job = await manager.start("large", {}, async () =>
      Array.from({ length: 1500 }, (_, id) => ({ id })),
    );
    for (
      let i = 0;
      i < 100 && (await manager.status(job.id)).state === "running";
      i++
    )
      await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await manager.exportResults(job.id)).toHaveLength(1500);
    expect(await manager.results(job.id, 0, 1000)).toMatchObject({
      total: 1500,
    });
    expect(
      JSON.parse(
        await readFile(join(directory, `${job.id}.result.json`), "utf8"),
      ),
    ).toHaveLength(1500);
    await manager.close();
  });
});
