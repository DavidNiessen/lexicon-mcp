import { readFile } from "node:fs/promises";
import { normalizeVersion } from "./release-version.mjs";
const { version } = JSON.parse(
  await readFile("packages/server/package.json", "utf8"),
);
const tag = process.env.RELEASE_TAG;
if (!tag || tag !== `v${normalizeVersion(tag)}` || tag !== `v${version}`)
  throw new Error("Tag must match the server version.");
for (const file of ["package.json"]) {
  if (JSON.parse(await readFile(file, "utf8")).version !== version)
    throw new Error("Workspace version must match the server.");
}
const runtimeVersion = await readFile("packages/server/src/version.ts", "utf8");
if (
  !runtimeVersion.includes(`export const VERSION = ${JSON.stringify(version)};`)
)
  throw new Error("Runtime version must match the package version.");
const type = process.env.RELEASE_TYPE ?? "prerelease";
if (!["prerelease", "release"].includes(type))
  throw new Error("Invalid release type.");
if (type === "release" && version.includes("-"))
  throw new Error("Stable releases cannot have prerelease versions.");
console.log(`Validated ${type} ${tag}.`);
