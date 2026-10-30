import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const { version } = JSON.parse(
  await readFile("packages/server/package.json", "utf8"),
);
const tag = process.env.RELEASE_TAG;
if (tag !== `v${version}` || !/^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(tag))
  throw new Error("Tag must match the server version.");
const visibility = execFileSync(
  "gh",
  ["repo", "view", "--json", "isPrivate", "--jq", ".isPrivate"],
  { encoding: "utf8" },
).trim();
if (visibility !== "true")
  throw new Error("This release workflow only runs for a private repository.");
console.log(`Validated private release ${tag}.`);
