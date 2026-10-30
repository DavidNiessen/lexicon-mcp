import { z } from "zod";
import { commandSchema } from "./commands.js";
import {
  filterSchema,
  fromSchema,
  smartlistSchema,
  trackEditsSchema,
} from "./schemas.js";
import { resolve, specification, type Schema } from "./spec.js";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
export interface Operation {
  name: string;
  method: HttpMethod;
  path: string;
  description: string;
  mutating: boolean;
  inputSchema: z.ZodType;
}
const names: Record<string, string> = {
  "GET /track": "get_track",
  "PATCH /track": "update_track",
  "PATCH /track/location": "relocate_track",
  "POST /tracks": "add_tracks",
  "GET /tracks": "list_tracks",
  "DELETE /tracks": "delete_tracks",
  "GET /tracks/selected": "get_selected_tracks",
  "GET /search/tracks": "search_tracks",
  "GET /playlist": "get_playlist",
  "POST /playlist": "create_playlist",
  "PATCH /playlist": "update_playlist",
  "GET /playlist-by-path": "get_playlist_by_path",
  "PATCH /playlist-tracks": "add_playlist_tracks",
  "DELETE /playlist-tracks": "remove_playlist_tracks",
  "GET /playlists": "list_playlists",
  "DELETE /playlists": "delete_playlists",
  "GET /playlists/selected": "get_selected_playlists",
  "POST /tag": "create_tag",
  "PATCH /tag": "update_tag",
  "DELETE /tag": "delete_tag",
  "GET /tags": "list_tags",
  "POST /tag-category": "create_tag_category",
  "PATCH /tag-category": "update_tag_category",
  "DELETE /tag-category": "delete_tag_category",
  "POST /control": "run_command",
  "GET /playing": "get_playing",
  "GET /queue": "get_queue",
};

export const operations: Operation[] = Object.entries(
  specification.paths,
).flatMap(([path, methods]) =>
  Object.entries(methods).map(([verb, operation]) => {
    const method = verb.toUpperCase() as HttpMethod;
    const key = `${method} ${path}`;
    if (!names[key]) throw new Error(`Unmapped operation ${key}`);
    const shape: Record<string, z.ZodType> = {};
    if (method === "GET") {
      for (const raw of operation.parameters ?? []) {
        const parameter = resolve(raw);
        const name = parameter.name as string;
        const content = parameter.content as
          | Record<string, { schema: Schema }>
          | undefined;
        let schema =
          name === "filter"
            ? filterSchema
            : fromSchema(
                (parameter.schema as Schema | undefined) ??
                  content?.["application/json"]?.schema ??
                  {},
              );
        if (!parameter.required) schema = schema.optional();
        shape[name] = schema;
      }
    } else {
      const body = operation.requestBody?.content["application/json"]?.schema;
      for (const [name, raw] of Object.entries(body?.properties ?? {})) {
        let schema =
          name === "edits"
            ? trackEditsSchema
            : name === "smartlist"
              ? smartlistSchema
              : fromSchema(raw);
        if (["id", "parentId", "categoryId"].includes(name))
          schema =
            name === "id" && path === "/track"
              ? z.union([z.number().int().positive(), z.literal("selected")])
              : z.number().int().positive();
        if (["ids", "trackIds"].includes(name))
          schema = z.array(z.number().int().positive()).min(1);
        if (name === "locations") schema = z.array(z.string().min(1)).min(1);
        if (name === "edits" || body?.required?.includes(name))
          shape[name] = schema;
        else shape[name] = schema.optional();
      }
    }
    return {
      name: `lexicon_${names[key]}`,
      method,
      path,
      description:
        `${operation.summary}. ${operation.description ?? ""}`.trim(),
      mutating: method !== "GET",
      inputSchema:
        path === "/control" ? commandSchema : z.object(shape).strict(),
    };
  }),
);

export function getOperation(name: string): Operation | undefined {
  return operations.find((operation) => operation.name === name);
}
