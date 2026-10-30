import { execFileSync } from "node:child_process";
import {
  readdir,
  readFile,
  mkdir,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { releaseArguments, publishArguments } from "./release-policy.mjs";
const tag = process.env.RELEASE_TAG;
const type = process.env.RELEASE_TYPE ?? "prerelease";
const sha = process.env.RELEASE_SHA;
if (!/^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(tag || ""))
  throw new Error("Invalid release tag.");
releaseArguments({ tag, type, sha, notes: "pending", uploads: ["pending"] });
if (
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() !==
  sha
)
  throw new Error("Checkout differs from the built release source.");
execFileSync(
  "gh",
  ["run", "download", process.env.RUN_ID, "--dir", "work/release-artifacts"],
  { stdio: "inherit" },
);
await mkdir("work/release-upload", { recursive: true });
async function collect(dir) {
  const found = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) found.push(...(await collect(full)));
    else found.push(full);
  }
  return found;
}
const uploads = [];
const sums = [];
for (const file of await collect("work/release-artifacts")) {
  if (!/\.(zip|tgz)$/.test(file)) continue;
  const name = path.basename(file);
  const digest = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
  const prior = uploads.find((item) => path.basename(item) === name);
  if (prior) {
    if (
      createHash("sha256")
        .update(await readFile(prior))
        .digest("hex") !== digest
    )
      throw new Error(`Conflicting release artifact ${name}`);
    continue;
  }
  const target = path.join("work/release-upload", name);
  await copyFile(file, target);
  uploads.push(target);
  sums.push(`${digest}  ${name}`);
}
for (const platform of ["win32-x64", "darwin-arm64", "darwin-x64"]) {
  const expected = `lexicon-mcp-${tag.slice(1)}-${platform}.zip`;
  if (!uploads.some((file) => path.basename(file) === expected))
    throw new Error(`Missing platform artifact ${expected}`);
}
await writeFile(
  "work/release-upload/SHA256SUMS",
  `${sums.sort().join("\n")}\n`,
);
uploads.push("work/release-upload/SHA256SUMS");
const tags = execFileSync(
  "git",
  ["tag", "--merged", sha, "--sort=-version:refname"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n");
const previous = tags.find(
  (value) => value !== tag && /^v\d+\.\d+\.\d+/.test(value),
);
const changes = execFileSync(
  "git",
  [
    "log",
    "--no-merges",
    "--format=- %s",
    previous ? `${previous}..${sha}` : sha,
  ],
  { encoding: "utf8" },
);
const notes = `${type === "prerelease" ? "Prerelease build" : "Release"}. Source: ${sha}. Platform artifacts passed automated package smoke checks; consult docs/compatibility.md for live Lexicon and host verification evidence. macOS binaries are ad-hoc signed; Windows binaries are unsigned.\n\n## Changes\n\n${changes}`;
await writeFile("work/release-upload/notes.md", notes);
execFileSync(
  "gh",
  releaseArguments({
    tag,
    type,
    sha,
    notes: "work/release-upload/notes.md",
    uploads,
  }),
  { stdio: "inherit" },
);
execFileSync("gh", publishArguments(tag, type), { stdio: "inherit" });
