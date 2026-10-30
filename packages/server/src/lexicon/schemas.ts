import { z } from "zod";
import { resolve, specification, type Schema } from "./spec.js";

export function fromSchema(raw: Schema): z.ZodType {
  const s = resolve(raw);
  let result: z.ZodType;
  if (s.enum) {
    const options = s.enum.map((value) =>
      z.literal(value as string | number | boolean | null),
    );
    result =
      options.length === 1
        ? options[0]!
        : z.union(options as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]]);
  } else if (s.oneOf) {
    result = z.union(
      s.oneOf.map(fromSchema) as [z.ZodType, z.ZodType, ...z.ZodType[]],
    );
  } else if (s.allOf) {
    result = s.allOf.map(fromSchema).reduce((a, b) => z.intersection(a, b));
  } else if (s.type === "object") {
    if (!s.properties) return z.record(z.string(), z.unknown());
    const shape: Record<string, z.ZodType> = {};
    for (const [name, property] of Object.entries(s.properties)) {
      shape[name] = s.required?.includes(name)
        ? fromSchema(property)
        : fromSchema(property).optional();
    }
    result = z.object(shape).strict();
  } else if (s.type === "array") {
    let array = z.array(fromSchema(s.items ?? {}));
    if (s.minItems !== undefined) array = array.min(s.minItems);
    if (s.maxItems !== undefined) array = array.max(s.maxItems);
    result = array;
  } else if (s.type === "integer" || s.type === "number") {
    let number = z.number();
    if (s.type === "integer") number = number.int();
    if (s.minimum !== undefined) number = number.min(s.minimum);
    if (s.maximum !== undefined) number = number.max(s.maximum);
    result = number;
  } else if (s.type === "boolean") result = z.boolean();
  else if (s.type === "string") result = z.string();
  else result = z.unknown();
  if (s.example === null) result = result.nullable();
  return s.description ? result.describe(s.description) : result;
}

const readOnly = new Set([
  "id",
  "type",
  "location",
  "locationUnique",
  "duration",
  "bitrate",
  "sizeBytes",
  "sampleRate",
  "fingerprint",
  "streamingService",
  "streamingId",
  "importSource",
]);
const edits: Record<string, z.ZodType> = {};
for (const [name, field] of Object.entries(
  specification.components.schemas.Track!.properties!,
)) {
  if (readOnly.has(name)) continue;
  let schema = fromSchema(field);
  if (name === "cuepoints")
    schema = schema.superRefine((value, ctx) => {
      const positions = new Set<number>();
      for (const [index, cue] of (
        value as Array<Record<string, unknown>>
      ).entries()) {
        const position = cue.position as number;
        if (position < 0 || positions.has(position))
          ctx.addIssue({
            code: "custom",
            path: [index, "position"],
            message: "Cue positions must be nonnegative and unique per track",
          });
        positions.add(position);
        if ((cue.startTime as number) < 0)
          ctx.addIssue({
            code: "custom",
            path: [index, "startTime"],
            message: "Cue time must be nonnegative",
          });
        if (
          cue.type === "5" &&
          (typeof cue.endTime !== "number" ||
            cue.endTime <= (cue.startTime as number))
        )
          ctx.addIssue({
            code: "custom",
            path: [index, "endTime"],
            message: "Loops require an end time after the start time",
          });
      }
    });
  if (name === "tempomarkers")
    schema = schema.superRefine((value, ctx) => {
      for (const [index, marker] of (
        value as Array<Record<string, unknown>>
      ).entries()) {
        if ((marker.bpm as number) <= 0)
          ctx.addIssue({
            code: "custom",
            path: [index, "bpm"],
            message: "Tempo marker BPM must be positive",
          });
      }
    });
  if (field.type === "integer" || field.type === "number")
    schema = z.union([schema, z.string().regex(/^[+-]\d+(?:\.\d+)?$/)]);
  else if (field.type === "string" || field.$ref) schema = schema.nullable();
  if (
    ["lastPlayed", "dateAdded", "dateModified", "archivedSince"].includes(name)
  )
    schema = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable();
  edits[name] = schema.optional();
}
export const trackEditsSchema = z
  .object(edits)
  .strict()
  .refine((v) => Object.keys(v).length > 0, "At least one edit is required");

const operators = specification.components.schemas["Smartlist Operators"]!
  .enum as string[];
const noValues = new Set([
  "Exists",
  "ExistsNot",
  "BooleanFalse",
  "BooleanTrue",
  "TempomarkerSameBpm",
  "TempomarkerNotSameBpm",
  "BpmExactNumber",
  "BpmNotExactNumber",
  "CuepointHasLoop",
  "CuepointHasNoLoop",
]);
const twoValues = new Set([
  "NumberBetween",
  "DateBetween",
  "DateNotRecent",
  "DateRecent",
]);
export const smartlistSchema = z
  .object({
    matchAll: z.boolean(),
    rules: z.array(
      z
        .object({
          field: z.string().min(1),
          operator: z.enum(operators as [string, ...string[]]),
          values: z.array(
            z.union([z.string(), z.number(), z.boolean(), z.null()]),
          ),
          or: z.boolean().optional(),
        })
        .strict()
        .superRefine((rule, ctx) => {
          const count = noValues.has(rule.operator)
            ? 0
            : twoValues.has(rule.operator)
              ? 2
              : 1;
          if (rule.values.length !== count)
            ctx.addIssue({
              code: "custom",
              message: `${rule.operator} requires ${count} values`,
            });
          const field =
            specification.components.schemas.Track!.properties![rule.field];
          if (
            field &&
            rule.operator.startsWith("String") &&
            field.type !== "string"
          )
            ctx.addIssue({
              code: "custom",
              message: "String operators require a string field",
            });
          if (
            field &&
            rule.operator.startsWith("Number") &&
            !["integer", "number"].includes(field.type ?? "")
          )
            ctx.addIssue({
              code: "custom",
              message: "Number operators require a numeric field",
            });
        }),
    ),
  })
  .strict();

export const filterSchema = z
  .object(
    Object.fromEntries(
      [
        "id",
        "title",
        "artist",
        "albumTitle",
        "label",
        "remixer",
        "mix",
        "composer",
        "producer",
        "grouping",
        "lyricist",
        "comment",
        "key",
        "genre",
        "bpm",
        "rating",
        "color",
        "year",
        "duration",
        "bitrate",
        "playCount",
        "location",
        "lastPlayed",
        "dateAdded",
        "dateModified",
        "sizeBytes",
        "sampleRate",
        "trackNumber",
        "energy",
        "danceability",
        "popularity",
        "happiness",
        "extra1",
        "extra2",
        "tags",
        "fileType",
      ].map((field) => [field, z.string().optional()]),
    ),
  )
  .strict();
