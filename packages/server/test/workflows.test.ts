import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ExportService,
  JobManager,
  WorkflowService,
} from "../src/workflows/index.js";
import { keysCompatible } from "../src/workflows/sets.js";

const directories: string[] = [];
async function temporary() {
  const directory = await mkdtemp(join(tmpdir(), "lexicon-workflows-"));
  directories.push(directory);
  return directory;
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function library(
  tracks: Record<string, unknown>[],
  playlist = { id: 7, type: "2", name: "Test", trackIds: [1, 2, 1] },
) {
  const calls: { method: string; path: string }[] = [];
  return {
    calls,
    async request(
      method: string,
      path: string,
      input: Record<string, unknown> = {},
    ) {
      calls.push({ method, path });
      if (path === "/tracks")
        return {
          data: {
            total: tracks.length,
            tracks: tracks.slice(
              Number(input.offset ?? 0),
              Number(input.offset ?? 0) + Number(input.limit ?? 500),
            ),
          },
        };
      if (path === "/search/tracks") return { tracks };
      if (path === "/tags") return { tags: [{ id: 1 }] };
      if (path === "/playlists")
        return { playlists: [{ id: 1, type: "1", children: [playlist] }] };
      if (path === "/playlist") return { playlist };
      throw new Error(`Unexpected request ${path}`);
    },
  };
}

describe("library workflows", () => {
  it("pages health findings and counts the whole library without writing", async () => {
    const client = library([
      { id: 1, title: "One", artist: "Artist", tags: [999] },
      {
        id: 2,
        title: "",
        artist: "",
        tags: [],
        cuepoints: [],
        tempomarkers: [],
      },
    ]);
    const result = (await new WorkflowService(client).run(
      "lexicon_library_health",
      { offset: 1, limit: 2 },
    )) as {
      total: number;
      findings: unknown[];
      scanned: number;
      playlistStats: { folders: number; playlists: number };
    };
    expect(result.scanned).toBe(2);
    expect(result.total).toBe(7);
    expect(result.findings).toHaveLength(2);
    expect(result.playlistStats).toMatchObject({ folders: 1, playlists: 1 });
    expect(client.calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("distinguishes strong fingerprint evidence from metadata candidates", async () => {
    const tracks = [
      {
        id: 1,
        fingerprint: "same",
        artist: " Artist ",
        title: "Song",
        duration: 180,
      },
      {
        id: 2,
        fingerprint: "same",
        artist: "artist",
        title: "song",
        duration: 180,
      },
      { id: 3, artist: "Other", title: "Track", duration: 200 },
      { id: 4, artist: "other", title: " TRACK ", duration: 201 },
    ];
    const result = (await new WorkflowService(library(tracks)).run(
      "lexicon_find_duplicates",
      {},
    )) as { candidates: { confidence: string; trackIds: number[] }[] };
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ confidence: "high", trackIds: [1, 2] }),
        expect.objectContaining({ confidence: "medium", trackIds: [3, 4] }),
      ]),
    );
    expect(result.candidates).toHaveLength(2);
  });

  it("proposes deterministic cleanup with explicit aliases without touching the API", async () => {
    const client = library([
      { id: 1, title: "  A   Song ", artist: "DJ", genre: "Techno" },
    ]);
    const result = (await new WorkflowService(client).run(
      "lexicon_cleanup_metadata",
      { trackIds: [1], aliases: { Techno: "Hard Techno" } },
    )) as { operations: unknown[] };
    expect(result.operations).toEqual([
      {
        tool: "lexicon_update_track",
        input: { id: 1, edits: { title: "A Song", genre: "Hard Techno" } },
      },
    ]);
    expect(client.calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("rejects reordered membership changes and proposes deduplication", async () => {
    const workflows = new WorkflowService(library([]));
    await expect(
      workflows.run("lexicon_playlist_workflow", {
        action: "reorder",
        playlistIds: [7],
        trackIds: [1, 2],
      }),
    ).rejects.toThrow("exactly");
    const proposal = (await workflows.run("lexicon_playlist_workflow", {
      action: "deduplicate",
      playlistIds: [7],
    })) as { operations: { input: Record<string, unknown> }[] };
    expect(proposal.operations[1]!.input.trackIds).toEqual([1, 2]);
  });

  it("uses harmonic compatibility and fits set length", async () => {
    expect(keysCompatible("Am", "8B")).toBe(true);
    expect(keysCompatible("12A", "1A")).toBe(true);
    expect(keysCompatible("8A", "10B")).toBe(false);
    const client = library([
      {
        id: 1,
        title: "One",
        artist: "A",
        bpm: 128,
        key: "Am",
        duration: 180,
        energy: 8,
      },
      { id: 2, title: "Two", artist: "B", bpm: 90, key: "Am", duration: 180 },
    ]);
    const result = (await new WorkflowService(client).run(
      "lexicon_prepare_set",
      { bpm: 128, key: "8A", durationMinutes: 4 },
    )) as { trackIds: number[]; durationSeconds: number };
    expect(result.trackIds).toEqual([1]);
    expect(result.durationSeconds).toBe(180);
  });
});

describe("persisted jobs and exports", () => {
  it("stores successful results and pages result arrays", async () => {
    const manager = new JobManager(await temporary());
    await manager.initialize();
    const job = await manager.start("report", {}, async () => [1, 2, 3]);
    for (
      let i = 0;
      i < 100 && (await manager.status(job.id)).state === "running";
      i++
    )
      await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await manager.results(job.id, 1, 1)).toMatchObject({
      total: 3,
      items: [2],
    });
    await manager.close();
  });

  it("cancels a running workflow and rejects traversal IDs", async () => {
    const manager = new JobManager(await temporary());
    const job = await manager.start(
      "report",
      {},
      async ({ signal }) =>
        new Promise((_, reject) =>
          signal!.addEventListener(
            "abort",
            () => reject(new Error("Cancelled")),
            { once: true },
          ),
        ),
    );
    expect((await manager.cancel(job.id)).state).toBe("cancelled");
    await expect(manager.status("../anything")).rejects.toThrow(
      "Invalid job ID",
    );
  });

  it("marks interrupted jobs and never replays them", async () => {
    const directory = await temporary();
    const id = "11111111-1111-1111-1111-111111111111";
    await writeFile(
      join(directory, `${id}.job.json`),
      JSON.stringify({ id, name: "x", state: "running" }),
    );
    const manager = new JobManager(directory);
    await manager.initialize();
    expect((await manager.status(id)).state).toBe("interrupted");
  });

  it("restricts export destinations, refuses overwrite, and neutralizes CSV formulas", async () => {
    const directory = await temporary();
    const reports = join(directory, "reports");
    await mkdir(reports);
    const exporter = new ExportService(reports);
    const output = join(reports, "report.csv");
    await exporter.write("csv", output, [
      { title: "=SUM(1,2)", comment: 'quote " test' },
    ]);
    expect(await readFile(output, "utf8")).toContain("'=SUM");
    await expect(exporter.write("json", output, {})).rejects.toThrow();
    await expect(
      exporter.write("json", join(directory, "outside.json"), {}),
    ).rejects.toThrow("outside");
  });
});
