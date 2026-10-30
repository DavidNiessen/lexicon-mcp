import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  LexiconClient,
  operations,
  getOperation,
  commands,
  commandSchema,
} from "../src/lexicon/index.js";

const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closes.splice(0).map((close) => close()));
});
async function fake(
  handler: Parameters<typeof createServer>[0],
): Promise<LexiconClient> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closes.push(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address() as { port: number };
  return new LexiconClient({
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    readRetries: 1,
  });
}

describe("upstream coverage", () => {
  it("maps all current HTTP operations and command enum values", () => {
    expect(operations).toHaveLength(27);
    expect(new Set(operations.map((op) => op.name)).size).toBe(27);
    expect(commands).toHaveLength(427);
  });
  it("rejects unknown filters, read-only edits, bad dates and missing edits", () => {
    expect(
      getOperation("lexicon_search_tracks")!.inputSchema.safeParse({
        filter: { artst: "typo" },
      }).success,
    ).toBe(false);
    for (const input of [
      { id: 1 },
      { id: 1, edits: { location: "/wrong" } },
      { id: 1, edits: { lastPlayed: "tomorrow" } },
      { id: 1, edits: { energy: true } },
    ]) {
      expect(
        getOperation("lexicon_update_track")!.inputSchema.safeParse(input)
          .success,
      ).toBe(false);
    }
    expect(
      getOperation("lexicon_update_track")!.inputSchema.safeParse({
        id: 1,
        edits: { energy: "+1" },
      }).success,
    ).toBe(true);
  });
  it("validates command parameters and excludes documented no-op commands", () => {
    expect(
      commandSchema.safeParse({
        action: "MusicPlayer_Load",
        parameters: { id: 1 },
      }).success,
    ).toBe(true);
    expect(
      commandSchema.safeParse({
        action: "MusicPlayer_Load",
        parameters: { id: -1 },
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({ action: "MusicPlayer_TempomarkerMoveGridLeft" })
        .success,
    ).toBe(false);
  });
  it("validates smartlist operator arity and field types", () => {
    const schema = getOperation("lexicon_create_playlist")!.inputSchema;
    expect(
      schema.safeParse({
        name: "test",
        type: "3",
        smartlist: {
          matchAll: true,
          rules: [
            { field: "bpm", operator: "NumberBetween", values: [120, 130] },
          ],
        },
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        name: "test",
        type: "3",
        smartlist: {
          matchAll: true,
          rules: [{ field: "bpm", operator: "StringContains", values: ["x"] }],
        },
      }).success,
    ).toBe(false);
  });
});

describe("Lexicon transport", () => {
  it("rejects malformed success envelopes and empty reads", async () => {
    for (const body of ["", "{}", '{"data":null}', '{"data":[]}', "not-json"]) {
      const client = new LexiconClient({
        fetch: async () => new Response(body, { status: 200 }),
      });
      await expect(client.request("GET", "/tracks")).rejects.toMatchObject({
        kind: "upstream",
      });
    }
  });
  it("preserves nullable imported cue fields and validates loops and duplicate positions", () => {
    const schema = getOperation("lexicon_update_track")!.inputSchema;
    const cue = {
      id: 8,
      type: "1",
      position: 0,
      startTime: 0,
      endTime: null,
      data: { rekordbox: { unknown: [1, 2] } },
    };
    expect(schema.parse({ id: 1, edits: { cuepoints: [cue] } })).toEqual({
      id: 1,
      edits: { cuepoints: [cue] },
    });
    expect(
      schema.safeParse({ id: 1, edits: { cuepoints: [cue, cue] } }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ id: 1, edits: { cuepoints: [{ ...cue, type: "5" }] } })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({
        id: 1,
        edits: { cuepoints: [{ ...cue, type: "5", endTime: 8 }] },
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        id: 1,
        edits: { tempomarkers: [{ startTime: 0, bpm: 0 }] },
      }).success,
    ).toBe(false);
  });
  it("accepts documented dynamic plugin IDs only with destructive review metadata", () => {
    const action = "PluginRunAction_my.plugin:action.id";
    expect(commandSchema.safeParse({ action }).success).toBe(true);
    expect(
      commandSchema.safeParse({ action: "PluginRunAction_malformed" }).success,
    ).toBe(false);
  });
  it("encodes arrays, objects and sort values and unwraps data", async () => {
    const client = await fake((req, res) => {
      const query = new URL(req.url!, "http://localhost").searchParams;
      expect(query.getAll("fields")).toEqual(["title", "artist"]);
      expect(query.get("filter[artist]")).toBe("Daft Punk");
      expect(JSON.parse(query.get("sort")!)).toEqual([
        { field: "title", dir: "asc" },
      ]);
      res.end(JSON.stringify({ data: { tracks: [], total: 0 } }));
    });
    expect(
      await client.request("GET", "/search/tracks", {
        fields: ["title", "artist"],
        filter: { artist: "Daft Punk" },
        sort: [{ field: "title", dir: "asc" }],
      }),
    ).toEqual({ tracks: [], total: 0 });
  });
  it("sends writes as JSON bodies and handles empty control response", async () => {
    const client = await fake((req, res) => {
      expect(req.method).toBe("POST");
      let text = "";
      req.on("data", (data) => {
        text += data;
      });
      req.on("end", () => {
        expect(JSON.parse(text)).toEqual({ action: "MusicPlayer_Play" });
        res.end();
      });
    });
    expect(
      await client.request("POST", "/control", { action: "MusicPlayer_Play" }),
    ).toEqual({ status: "dispatched" });
  });
  it("retries explicitly rejected busy writes but not ambiguous server failures", async () => {
    let attempts = 0;
    const client = await fake((_req, res) => {
      attempts++;
      if (attempts === 1) {
        res.statusCode = 400;
        res.end(JSON.stringify({ errorCode: 2, message: "busy" }));
      } else {
        res.statusCode = 500;
        res.end(JSON.stringify({ errorCode: 8, message: "failure" }));
      }
    });
    await expect(
      client.request("PATCH", "/track", { id: 1, edits: { title: "Test" } }),
    ).rejects.toMatchObject({ errorCode: 8 });
    expect(attempts).toBe(2);
  });
  it("never replays a write after a network failure", async () => {
    let attempts = 0;
    const client = new LexiconClient({
      fetch: async () => {
        attempts++;
        throw new Error("connection dropped");
      },
    });
    await expect(
      client.request("POST", "/tracks", { locations: ["x"] }),
    ).rejects.toMatchObject({ kind: "ambiguous" });
    expect(attempts).toBe(1);
  });
});
