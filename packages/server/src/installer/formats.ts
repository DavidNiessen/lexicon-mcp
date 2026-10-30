import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import type { AgentTarget } from "./agents.js";

export type ServerEntry = {
  command: string;
  args: string[];
  type?: string;
  [key: string]: unknown;
};
type Table = Record<string, unknown>;
function table(value: unknown): value is Table {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  return table(value)
    ? `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
        .join(",")}}`
    : JSON.stringify(value);
}

function parsed(source: string, target: AgentTarget): Table {
  if (!source.trim()) return {};
  if (target.format === "toml") return parseToml(source) as Table;
  const errors: ParseError[] = [];
  const result = parse(source, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length || !table(result))
    throw new Error(`Invalid JSON configuration: ${target.path}`);
  return result;
}

/** Read only the named server, refusing malformed parent maps rather than replacing them. */
export function existingEntry(source: string, target: AgentTarget): unknown {
  const config = parsed(source, target),
    map = config[target.key];
  if (map !== undefined && !table(map))
    throw new Error(`Expected an object at ${target.key}: ${target.path}`);
  return (map as Table | undefined)?.lexicon;
}

function tomlHeaders(source: string) {
  const matches = [...source.matchAll(/^\s*\[([^\]\n]+)\][^\n]*(?:\n|$)/gm)];
  return matches.map((match) => {
    const path: string[] = [];
    try {
      let value: unknown = parseToml(
        `[${match[1]}]\n__lexicon_marker__ = true`,
      );
      while (table(value) && !Object.hasOwn(value, "__lexicon_marker__")) {
        const keys = Object.keys(value);
        if (keys.length !== 1) break;
        path.push(keys[0]!);
        value = value[keys[0]!];
      }
    } catch {
      /* Non-table text is never removed. */
    }
    return { start: match.index!, path };
  });
}

/** Keep unrelated text/comments byte-for-byte; edit only this server's table. */
function updateToml(
  source: string,
  target: AgentTarget,
  entry: ServerEntry | undefined,
) {
  const headers = tomlHeaders(source);
  const ranges = headers.flatMap((header, index) =>
    header.path[0] === target.key && header.path[1] === "lexicon"
      ? [
          {
            start: header.start,
            end: headers[index + 1]?.start ?? source.length,
          },
        ]
      : [],
  );
  if (existingEntry(source, target) !== undefined && !ranges.length)
    throw new Error(
      "Cannot safely edit an inline Lexicon TOML definition. Convert it to a [mcp_servers.lexicon] table first.",
    );
  let next = source;
  for (const range of ranges.reverse())
    next = next.slice(0, range.start) + next.slice(range.end);
  if (entry) {
    const section = stringifyToml({ [target.key]: { lexicon: entry } });
    next = next.trimEnd() + (next.trim() ? "\n\n" : "") + section;
  }
  // Reject ambiguous/multiline/inline-table constructs instead of corrupting settings.
  const result = parsed(next, target);
  if (
    entry &&
    canonical((result[target.key] as Table)?.lexicon) !== canonical(entry)
  )
    throw new Error("TOML edit did not produce the expected server definition");
  const original = parsed(source, target);
  for (const config of [original, result]) {
    const servers = config[target.key];
    if (table(servers)) {
      delete servers.lexicon;
      if (!Object.keys(servers).length) delete config[target.key];
    }
  }
  if (canonical(original) !== canonical(result))
    throw new Error(
      "Cannot safely edit this TOML layout without changing unrelated settings.",
    );
  return next;
}

export function updateEntry(
  source: string,
  target: AgentTarget,
  entry: ServerEntry | undefined,
): string {
  existingEntry(source, target);
  if (target.format === "toml") return updateToml(source, target, entry);
  const base = source.trim() ? source : "{}\n";
  const edits = modify(base, [target.key, "lexicon"], entry, {
    formattingOptions: {
      insertSpaces: true,
      tabSize: 2,
      eol: source.includes("\r\n") ? "\r\n" : "\n",
    },
  });
  const next = applyEdits(base, edits);
  parsed(next, target);
  return next;
}
