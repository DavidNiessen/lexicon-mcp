import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const core = "(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)";
const identifier = "(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)";
const versionPattern = new RegExp(
  `^${core}(?:-${identifier}(?:\\.${identifier})*)?$`,
);
export function normalizeVersion(input) {
  const value = input.trim().replace(/^v/, "");
  if (!versionPattern.test(value))
    throw new Error(
      "Version must be SemVer, optionally prefixed with v (for example 0.2.0 or v0.2.0-rc.1).",
    );
  return value;
}
export function stableTags(tags) {
  return tags
    .filter((tag) => /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag))
    .sort((a, b) => {
      const x = a.slice(1).split(".").map(Number),
        y = b.slice(1).split(".").map(Number);
      for (let i = 0; i < 3; i++) {
        if (x[i] !== y[i]) return y[i] - x[i];
      }
      return 0;
    });
}
export function chooseVersion({
  current,
  tags = [],
  commits = [],
  manual = "",
}) {
  const previous = stableTags(tags)[0] ?? null;
  if (manual.trim())
    return { previous, next: normalizeVersion(manual), manual: true };
  if (!commits.length)
    throw new Error(
      "No unreleased commits; supply a new manual version only if a new release is intended.",
    );
  if (!previous)
    return { previous, next: normalizeVersion(current), manual: false };
  const parts = previous.slice(1).split(".").map(Number);
  const breaking = commits.some(
    ({ subject, body = "" }) =>
      /^[a-z]+(?:\([^\n]+\))?!:/.test(subject) ||
      /^BREAKING[ -]CHANGE:/m.test(body),
  );
  const feature = commits.some(({ subject }) =>
    /^feat(?:\([^\n]+\))?:/.test(subject),
  );
  if (breaking) {
    parts[0]++;
    parts[1] = 0;
    parts[2] = 0;
  } else if (feature) {
    parts[1]++;
    parts[2] = 0;
  } else parts[2]++;
  return { previous, next: parts.join("."), manual: false };
}
export function releaseHistory(cwd = process.cwd()) {
  const git = (args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const tags = git(["tag", "--merged", "HEAD"]).split("\n").filter(Boolean);
  const previous = stableTags(tags)[0];
  const fields = git([
    "log",
    "--no-merges",
    "--format=%s%x00%b%x00",
    ...(previous ? [`${previous}..HEAD`] : []),
  ]).split("\0");
  const commits = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const subject = fields[i].trim();
    if (subject) commits.push({ subject, body: fields[i + 1].trim() });
  }
  return { tags, commits };
}
export async function stampVersion(version, cwd = process.cwd()) {
  const next = normalizeVersion(version);
  for (const file of [
    "package.json",
    "packages/server/package.json",
    "packages/companion/package.json",
  ]) {
    const path = join(cwd, file),
      data = JSON.parse(await readFile(path, "utf8"));
    data.version = next;
    await writeFile(path, JSON.stringify(data, null, 2) + "\n");
  }
  await writeFile(
    join(cwd, "packages/server/src/version.ts"),
    `// Kept in sync with package manifests by release preparation.\nexport const VERSION = ${JSON.stringify(next)};\n`,
  );
}
