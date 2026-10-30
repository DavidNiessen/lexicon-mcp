import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { normalizeVersion } from "./release-version.mjs";
const { version } = JSON.parse(
  await readFile("packages/server/package.json", "utf8"),
);
const tag = process.env.RELEASE_TAG;
if (!tag || tag !== `v${normalizeVersion(tag)}` || tag !== `v${version}`)
  throw new Error("Tag must match the server version.");
for (const file of ["package.json", "packages/companion/package.json"]) {
  if (JSON.parse(await readFile(file, "utf8")).version !== version)
    throw new Error("Workspace and companion versions must match the server.");
}
const runtimeVersion = await readFile("packages/server/src/version.ts", "utf8");
if (
  !runtimeVersion.includes(`export const VERSION = ${JSON.stringify(version)};`)
)
  throw new Error("Runtime version must match the package version.");
const visibility = execFileSync(
  "gh",
  ["repo", "view", "--json", "isPrivate", "--jq", ".isPrivate"],
  { encoding: "utf8" },
).trim();
if (visibility !== "true")
  throw new Error("This release workflow only runs for a private repository.");
console.log(`Validated private release ${tag}.`);
