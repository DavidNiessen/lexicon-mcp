import { normalizeVersion } from "./release-version.mjs";
export function releaseArguments({ tag, type, sha, notes, uploads }) {
  if (!["prerelease", "release"].includes(type))
    throw new Error("Invalid release type.");
  if (!tag || tag !== `v${normalizeVersion(tag)}`)
    throw new Error("Invalid release tag.");
  if (!/^[a-f0-9]{40}$/.test(sha ?? ""))
    throw new Error("Release source must be a commit SHA.");
  if (type === "release" && tag.includes("-"))
    throw new Error("Stable release cannot have a prerelease version.");
  if (!uploads?.length) throw new Error("Cannot publish without artifacts.");
  return [
    "release",
    "create",
    tag,
    "--draft",
    "--target",
    sha,
    ...(type === "prerelease" ? ["--prerelease"] : []),
    "--title",
    `Lexicon MCP ${tag}`,
    "--notes-file",
    notes,
    ...uploads,
  ];
}
export function publishArguments(tag, type) {
  return [
    "release",
    "edit",
    tag,
    "--draft=false",
    `--prerelease=${type === "prerelease"}`,
    `--latest=${type === "release"}`,
  ];
}
