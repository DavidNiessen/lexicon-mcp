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
const tag = process.env.RELEASE_TAG;
if (!/^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(tag || ""))
  throw new Error("Invalid release tag.");
const visibility = execFileSync(
  "gh",
  ["repo", "view", "--json", "isPrivate", "--jq", ".isPrivate"],
  { encoding: "utf8" },
).trim();
if (visibility !== "true")
  throw new Error("Refusing to release outside a private repository.");
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
await writeFile(
  "work/release-upload/SHA256SUMS",
  `${sums.sort().join("\n")}\n`,
);
uploads.push("work/release-upload/SHA256SUMS");
const tags = execFileSync(
  "git",
  ["tag", "--merged", tag, "--sort=-version:refname"],
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
    previous ? `${previous}..${tag}` : tag,
  ],
  { encoding: "utf8" },
);
const notes = `Private release candidate. Platform artifacts passed automated package smoke checks; consult docs/compatibility.md for live Lexicon and host verification evidence. macOS binaries are ad-hoc signed; Windows binaries are unsigned. Public distribution is disabled.\n\n## Changes\n\n${changes}`;
await writeFile("work/release-upload/notes.md", notes);
execFileSync(
  "gh",
  [
    "release",
    "create",
    tag,
    "--draft",
    "--prerelease",
    "--title",
    `Lexicon MCP ${tag}`,
    "--notes-file",
    "work/release-upload/notes.md",
    ...uploads,
  ],
  { stdio: "inherit" },
);
