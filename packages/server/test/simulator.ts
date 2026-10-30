import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

export interface SimulatedTrack {
  id: number;
  [field: string]: unknown;
}
export interface SimulatedPlaylist {
  id: number;
  name: string;
  type: string;
  trackIds: number[];
  parentId?: number;
  [field: string]: unknown;
}
interface Entity {
  id: number;
  [field: string]: unknown;
}
interface RequestRecord {
  method: string;
  path: string;
  input: Record<string, unknown>;
}
interface Failure {
  status: number;
  errorCode: number;
  message: string;
  method?: string;
  path?: string;
}

export async function createSimulator(
  seed: {
    tracks?: SimulatedTrack[];
    playlists?: SimulatedPlaylist[];
    tags?: Entity[];
    categories?: Entity[];
  } = {},
) {
  const state = {
    tracks: new Map(
      (seed.tracks ?? []).map((track) => [track.id, structuredClone(track)]),
    ),
    playlists: new Map(
      (seed.playlists ?? []).map((playlist) => [
        playlist.id,
        structuredClone(playlist),
      ]),
    ),
    tags: new Map(
      (seed.tags ?? []).map((tag) => [tag.id, structuredClone(tag)]),
    ),
    categories: new Map(
      (seed.categories ?? []).map((category) => [
        category.id,
        structuredClone(category),
      ]),
    ),
    selectedTrackIds: [] as number[],
    selectedPlaylistIds: [] as number[],
    commands: [] as Record<string, unknown>[],
  };
  const requests: RequestRecord[] = [];
  const failures: Failure[] = [];
  let nextId = 10000;
  const fail = (errorCode: number, message: string): never => {
    throw { status: 400, errorCode, message };
  };
  const getTrack = (id: unknown) =>
    state.tracks.get(Number(id)) ?? fail(100, "Track does not exist");
  const getPlaylist = (id: unknown) =>
    state.playlists.get(Number(id)) ?? fail(101, "Playlist does not exist");
  const dispatch = (
    method: string,
    path: string,
    input: Record<string, unknown>,
  ): unknown => {
    if (path === "/tracks/selected") return { ids: state.selectedTrackIds };
    if (path === "/playlists/selected")
      return { ids: state.selectedPlaylistIds };
    if (method === "GET" && (path === "/tracks" || path === "/search/tracks")) {
      let tracks = [...state.tracks.values()];
      if (input.source === "archived")
        tracks = tracks.filter((track) => track.archived);
      if (input.source === "non-archived" || !input.source)
        tracks = tracks.filter((track) => !track.archived);
      if (input.source === "incoming")
        tracks = tracks.filter((track) => track.incoming);
      const filter = input.filter as Record<string, unknown> | undefined;
      if (filter?.id) {
        const ids = new Set(String(filter.id).split(",").map(Number));
        tracks = tracks.filter((track) => ids.has(track.id));
      }
      for (const [field, value] of Object.entries(filter ?? {})) {
        if (field !== "id")
          tracks = tracks.filter((track) =>
            String(track[field] ?? "")
              .toLowerCase()
              .includes(String(value).toLowerCase()),
          );
      }
      const offset = Number(input.offset ?? 0);
      const limit = Number(input.limit ?? 1000);
      if (limit > 1000 || limit < 1) fail(5, "Invalid limit");
      return {
        tracks: tracks.slice(offset, offset + limit),
        total: tracks.length,
        limit,
        offset,
      };
    }
    if (path === "/track" && method === "GET")
      return {
        track: getTrack(
          input.id === "selected" ? state.selectedTrackIds[0] : input.id,
        ),
      };
    if (path === "/track" && method === "PATCH") {
      const ids =
        input.id === "selected" ? state.selectedTrackIds : [Number(input.id)];
      const tracks = ids.map((id) => {
        const track = getTrack(id);
        Object.assign(track, input.edits);
        return track;
      });
      return { track: tracks[0], tracks };
    }
    if (path === "/track/location" && method === "PATCH") {
      const track = getTrack(input.id);
      if (
        [...state.tracks.values()].some(
          (other) => other.id !== track.id && other.location === input.location,
        )
      )
        fail(110, "Location already exists");
      track.location = input.location;
      return { track };
    }
    if (path === "/tracks" && method === "DELETE") {
      for (const id of input.ids as number[]) {
        getTrack(id);
        state.tracks.delete(id);
      }
      return {};
    }
    if (path === "/tracks" && method === "POST") {
      const tracks = (input.locations as string[]).map((location) => {
        const track = { id: nextId++, location };
        state.tracks.set(track.id, track);
        return track;
      });
      return { tracks };
    }
    if (path === "/playlist" && method === "GET")
      return { playlist: getPlaylist(input.id) };
    if (path === "/playlist" && method === "POST") {
      const playlist = {
        ...input,
        id: nextId++,
        name: String(input.name),
        type: String(input.type),
        trackIds: [],
      };
      state.playlists.set(playlist.id, playlist);
      return { id: playlist.id };
    }
    if (path === "/playlist" && method === "PATCH") {
      Object.assign(getPlaylist(input.id), input);
      return {};
    }
    if (path === "/playlists" && method === "GET")
      return { playlists: [...state.playlists.values()] };
    if (path === "/playlists" && method === "DELETE") {
      for (const id of input.ids as number[]) state.playlists.delete(id);
      return {};
    }
    if (path === "/playlist-tracks") {
      const playlist = getPlaylist(input.id);
      if (playlist.type !== "2") fail(104, "Not a normal playlist");
      const ids = input.trackIds as number[];
      if (method === "PATCH")
        playlist.trackIds.splice(
          Number(input.index ?? playlist.trackIds.length),
          0,
          ...ids,
        );
      else if (method === "DELETE")
        playlist.trackIds = playlist.trackIds.filter((id) => !ids.includes(id));
      else fail(4, "Unsupported method");
      return {};
    }
    if (path === "/tags" && method === "GET")
      return {
        tags: [...state.tags.values()],
        categories: [...state.categories.values()],
      };
    if (path === "/tag" || path === "/tag-category") {
      const entities = path === "/tag" ? state.tags : state.categories;
      if (method === "POST") {
        const id = nextId++;
        entities.set(id, { ...input, id });
        return { id };
      }
      if (method === "PATCH") {
        const entity =
          entities.get(Number(input.id)) ?? fail(109, "Tag does not exist");
        Object.assign(entity, input);
        return {};
      }
      if (method === "DELETE") {
        entities.delete(Number(input.id));
        return {};
      }
    }
    if (path === "/control" && method === "POST") {
      state.commands.push(input);
      return {};
    }
    if (path === "/playing")
      return { track: null, progress: null, currentTime: null };
    if (path === "/queue") return { tracks: [] };
    return fail(4, "Endpoint does not exist");
  };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const input =
        request.method === "GET" ? queryInput(url) : await bodyInput(request);
      const path = url.pathname.replace(/^\/v1/, "");
      requests.push({ method: request.method ?? "GET", path, input });
      const failure = failures[0];
      if (
        failure &&
        (!failure.method || failure.method === request.method) &&
        (!failure.path || failure.path === path)
      ) {
        failures.shift();
        throw failure;
      }
      const data = dispatch(request.method ?? "GET", path, input);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data }));
    } catch (error) {
      const failure = error as Failure;
      response.writeHead(failure.status ?? 500, {
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          errorCode: failure.errorCode ?? 8,
          message: failure.message ?? "Simulator error",
        }),
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    state,
    requests,
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    failNext: (failure: Failure) => failures.push(failure),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

function queryInput(url: URL): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [name, value] of url.searchParams) {
    const filter = /^filter\[(.+)\]$/.exec(name);
    if (filter) {
      ((input.filter ??= {}) as Record<string, unknown>)[filter[1]!] = value;
      continue;
    }
    if (name === "filter" || name === "sort") {
      input[name] = JSON.parse(value);
      continue;
    }
    if (name === "fields") {
      ((input.fields ??= []) as string[]).push(value);
      continue;
    }
    input[name] = value;
  }
  return input;
}

async function bodyInput(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return chunks.length
    ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
        string,
        unknown
      >)
    : {};
}
