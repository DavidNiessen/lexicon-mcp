import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { Runtime } from "../src/runtime.js";

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function runtime(readOnly = false) {
  const dataDir = await mkdtemp(join(tmpdir(), "lexicon-runtime-"));
  directories.push(dataDir);
  const instance = new Runtime({
    dataDir,
    baseUrl: "http://127.0.0.1:48624/v1",
    port: 48625,
    readOnly,
  });
  await instance.initialize();
  return instance;
}

it("freezes a selected track to its explicit ID and rejects ambiguous multiple selections", async () => {
  const instance = await runtime();
  const request = vi.spyOn(instance.client, "request");
  request.mockResolvedValue({ ids: [12] });
  const operation = {
    tool: "lexicon_update_track",
    input: { id: "selected", edits: { rating: 5 } },
  };
  expect(await instance.prepare(operation)).toEqual({
    ...operation,
    input: { id: 12, edits: { rating: 5 } },
  });
  request.mockResolvedValue({ ids: [12, 13] });
  await expect(instance.prepare(operation)).rejects.toThrow("explicit IDs");
});

it("uses catalog risk rather than a prefix regex to decide review", async () => {
  const instance = await runtime();
  expect(
    instance.requiresPlan({
      tool: "lexicon_run_command",
      input: { action: "MusicPlayer_DeleteHotcue", parameters: { index: 1 } },
    }),
  ).toBe(true);
  expect(
    instance.requiresPlan({
      tool: "lexicon_run_command",
      input: { action: "MusicPlayer_Play" },
    }),
  ).toBe(false);
  expect(
    instance.requiresPlan({
      tool: "lexicon_run_command",
      input: { action: "TrackBrowser_TagWriter" },
    }),
  ).toBe(true);
  expect(
    instance.requiresPlan({
      tool: "lexicon_run_command",
      input: { action: "AudioAnalyzer_Analyze", parameters: { trackIds: [1] } },
    }),
  ).toBe(true);
});

it("ignores volatile playback progress but captures the affected track", async () => {
  const instance = await runtime();
  const request = vi.spyOn(instance.client, "request");
  request.mockResolvedValueOnce({
    track: { id: 12, title: "Test" },
    progress: 0.2,
    currentTime: 12,
  });
  const operation = {
    tool: "lexicon_run_command",
    input: { action: "MusicPlayer_DeleteHotcue", parameters: { index: 1 } },
  };
  const first = await instance.snapshot(operation);
  request.mockResolvedValueOnce({
    track: { id: 12, title: "Test" },
    progress: 0.3,
    currentTime: 20,
  });
  expect(await instance.snapshot(operation)).toEqual(first);
  request.mockResolvedValueOnce({
    track: { id: 13, title: "Other" },
    progress: 0.3,
    currentTime: 20,
  });
  expect(await instance.snapshot(operation)).not.toEqual(first);
});

it("captures explicitly requested analysis tracks rather than unrelated UI selections", async () => {
  const instance = await runtime();
  const request = vi
    .spyOn(instance.client, "request")
    .mockResolvedValue({ track: { id: 17 } });
  expect(
    await instance.snapshot({
      tool: "lexicon_run_command",
      input: {
        action: "AudioAnalyzer_Analyze",
        parameters: { trackIds: [17] },
      },
    }),
  ).toEqual({ tracks: [{ track: { id: 17 } }] });
  expect(request).toHaveBeenCalledExactlyOnceWith("GET", "/track", { id: 17 });
});

it("returns a serializable parameter schema from command inspection", async () => {
  const instance = await runtime();
  const result = (await instance.call("lexicon_get_command", {
    name: "MusicPlayer_Load",
  })) as Record<string, unknown>;
  expect(result).not.toHaveProperty("inputSchema");
  expect(result.parameterSchema).toMatchObject({
    type: "object",
    required: ["id"],
  });
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
});

it("read-only mode blocks low-risk player commands before HTTP mutation", async () => {
  const instance = await runtime(true);
  const request = vi.spyOn(instance.client, "request");
  await expect(
    instance.call("lexicon_run_command", { action: "MusicPlayer_Play" }),
  ).rejects.toThrow("Read-only");
  expect(request).not.toHaveBeenCalled();
});

it("never reports completion for fire-and-forget controls", async () => {
  const instance = await runtime();
  vi.spyOn(instance.client, "request").mockResolvedValue({});
  expect(
    await instance.call("lexicon_run_command", { action: "MusicPlayer_Play" }),
  ).toMatchObject({ status: "dispatched", completionObservable: false });
});
