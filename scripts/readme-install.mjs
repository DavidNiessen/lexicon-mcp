import { normalizeVersion } from "./release-version.mjs";

export const stableUnavailable =
  "No stable release has been published yet. Use the prerelease below.";

export function installTarget({ repository, tag, type }) {
  if (
    typeof repository !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repository)
  )
    throw new Error("Expected a GitHub owner/repository name.");
  if (!["release", "prerelease"].includes(type))
    throw new Error("Choose release or prerelease.");
  const version = normalizeVersion(tag ?? "");
  if (type === "release" && version.includes("-"))
    throw new Error("Stable release cannot have a prerelease version.");
  return {
    repository,
    type,
    version,
    tag: `v${version}`,
    artifact: `lexicon-mcp-${version}.tgz`,
    command: `npx --yes https://github.com/${repository}/releases/download/v${version}/lexicon-mcp-${version}.tgz install`,
  };
}

function sections(source) {
  const blocks = ["release", "prerelease"].map((type) => {
    const marker = (side) => `<!-- install:${type}:${side} -->`;
    const positions = ["start", "end"].map((side) => {
      const text = marker(side);
      if (source.split(text).length !== 2)
        throw new Error(`README requires exactly one ${text} marker.`);
      const index = source.indexOf(text);
      const after = source.slice(index + text.length);
      if (
        (index && source[index - 1] !== "\n") ||
        (after && !/^\r?\n/.test(after))
      )
        throw new Error("README install markers must occupy their own lines.");
      return { index, end: index + text.length };
    });
    const [start, end] = positions;
    if (start.end >= end.index)
      throw new Error("README install markers are reversed.");
    return {
      type,
      start: start.end,
      end: end.index,
      raw: source.slice(start.end, end.index),
    };
  });
  const ordered = [...blocks].sort((a, b) => a.start - b.start);
  if (ordered[0].end > ordered[1].start)
    throw new Error("README install sections must not overlap.");
  return blocks;
}

function existingCommand(block) {
  const inner = block.raw.trim();
  if (block.type === "release" && inner === stableUnavailable) return;
  const lines = inner.split(/\r?\n/);
  if (lines.length !== 3 || lines[0] !== "```sh" || lines[2] !== "```")
    throw new Error("Install sections may contain only their managed command.");
  const match = lines[1].match(
    /^npx --yes https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\/(v[^/]+)\/lexicon-mcp-([^/]+)\.tgz install$/,
  );
  if (!match)
    throw new Error("Install section has an unexpected installation command.");
  const target = installTarget({
    repository: match[1],
    tag: match[2],
    type: block.type,
  });
  if (target.version !== match[3])
    throw new Error("Install tag and artifact version differ.");
  return target;
}

export function currentInstall(source, type) {
  const blocks = sections(source);
  for (const block of blocks) existingCommand(block);
  const block = blocks.find((entry) => entry.type === type);
  if (!block) throw new Error("Choose release or prerelease.");
  return existingCommand(block);
}

/** Replace only one managed command, preserving every other byte and line ending. */
export function replaceInstall(source, options) {
  const target = installTarget(options);
  const blocks = sections(source);
  for (const block of blocks) existingCommand(block);
  const block = blocks.find((entry) => entry.type === target.type);
  const eol = block.raw.includes("\r\n") ? "\r\n" : "\n";
  const leading = block.raw.match(/^\s*/)[0];
  const trailing = block.raw.match(/\s*$/)[0];
  const replacement =
    leading + ["```sh", target.command, "```"].join(eol) + trailing;
  return source.slice(0, block.start) + replacement + source.slice(block.end);
}
