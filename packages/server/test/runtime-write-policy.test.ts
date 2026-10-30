import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { Runtime } from "../src/runtime.js";
import { operations } from "../src/lexicon/index.js";

const folders: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    folders.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), "lexicon-write-policy-"));
  folders.push(dataDir);
  const runtime = new Runtime({
    dataDir,
    baseUrl: "http://127.0.0.1:1/v1",
    port: 48625,
    readOnly: false,
  });
  await runtime.initialize();
  const request = vi
    .spyOn(runtime.client, "request")
    .mockImplementation(async (_method, path, input) => {
      if (path === "/tracks/selected") return { ids: [1] } as any;
      if (path === "/playing") return { track: { id: 1 } } as any;
      if (path === "/playlists/selected") return { ids: [1] } as any;
      if (path === "/playlists") return { playlists: [] } as any;
      if (path === "/tags") return { tags: [] } as any;
      return {
        track: { id: input?.id, title: "Synthetic track", tags: [183] },
        playlist: { id: input?.id },
      } as any;
    });
  return { runtime, request };
}

it("cannot evade approval by splitting 117 tag edits into individual track calls", async () => {
  const { runtime, request } = await fixture();
  for (let id = 1; id <= 117; id++) {
    const result = (await runtime.call("lexicon_update_track", {
      id,
      edits: { tags: [183, 218] },
    })) as any;
    expect(result.reviewRequired).toBe(true);
    expect(result.plan.status).toBe("pending");
    expect(result.plan.outcomes).toEqual([]);
    expect(result.plan.operations).toEqual([
      {
        tool: "lexicon_update_track",
        input: { id, edits: { tags: [183, 218] } },
      },
    ]);
  }
  expect(request).toHaveBeenCalledTimes(117);
  expect(request.mock.calls.every(([method]) => method === "GET")).toBe(true);
}, 15000);

it("requires plans for every persistent API mutation regardless target count or nested arrays", async () => {
  const { runtime } = await fixture();
  for (const operation of operations.filter(
    (operation) => operation.path !== "/control",
  )) {
    expect(
      runtime.requiresPlan({ tool: operation.name, input: {} }),
      operation.name,
    ).toBe(operation.mutating);
  }
});

it.each([
  { tool: "lexicon_update_track", input: { id: 1, edits: { rating: 2 } } },
  { tool: "lexicon_update_track", input: { id: 1, edits: { tags: [218] } } },
  { tool: "lexicon_create_playlist", input: { name: "Synthetic", type: "2" } },
  { tool: "lexicon_update_playlist", input: { id: 1, name: "Synthetic" } },
  { tool: "lexicon_add_playlist_tracks", input: { id: 1, trackIds: [1] } },
  { tool: "lexicon_create_tag", input: { categoryId: 1, label: "Synthetic" } },
  { tool: "lexicon_update_tag", input: { id: 1, label: "Synthetic" } },
])(
  "returns a pending plan without writing for a single-target $tool",
  async ({ tool, input }) => {
    const { runtime, request } = await fixture();
    const result = (await runtime.call(tool, input)) as any;
    expect(result.reviewRequired).toBe(true);
    expect(result.plan.status).toBe("pending");
    expect(request.mock.calls.every(([method]) => method === "GET")).toBe(true);
  },
);

it.each([
  "MusicPlayer_CreateHotcue1",
  "MusicPlayer_MoveHotcue1",
  "MusicPlayer_ToggleMemoryCue1",
  "MusicPlayer_AddEmptyCue",
  "MusicPlayer_TempomarkerSet",
  "MusicPlayer_TempomarkerDoubleBpm",
  "MusicPlayer_TempomarkerTapBpm",
  "MusicPlayer_ApplyCueTemplate1",
  "MusicPlayer_AddCueAsLast",
  "Playlists_NewPlaylist",
  "Playlists_NewSmartlist",
  "Playlists_NewFolder",
  "Playlists_SetAsFavorite",
  "Playlists_EditSmartlist",
  "TrackBrowser_SendToNewPlaylist",
  "TrackBrowser_SendToIncoming",
])(
  "requires review for persistent control %s even when catalog risk is low",
  async (action) => {
    const { runtime, request } = await fixture();
    const result = (await runtime.call("lexicon_run_command", {
      action,
    })) as any;
    expect(result.reviewRequired).toBe(true);
    expect(result.plan.status).toBe("pending");
    expect(request.mock.calls.every(([method]) => method === "GET")).toBe(true);
  },
);

it.each(["MusicPlayer_Play", "MusicPlayer_Pause", "Navigation_ToggleSidebar"])(
  "preserves direct nonpersistent control %s",
  async (action) => {
    const { runtime, request } = await fixture();
    const result = await runtime.call("lexicon_run_command", { action });
    expect(result).toMatchObject({
      status: "dispatched",
      completionObservable: false,
    });
    expect(request).toHaveBeenCalledExactlyOnceWith("POST", "/control", {
      action,
    });
  },
);
