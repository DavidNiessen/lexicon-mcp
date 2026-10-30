import { spawnSync } from "node:child_process";

const allowed = new Set([
  "MIT",
  "Apache-2.0",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "Python-2.0",
]);
const entry = process.env.npm_execpath;
if (!entry)
  throw new Error(
    "Run this check through pnpm check so the pinned package-manager entrypoint is available.",
  );
const result = spawnSync(
  process.execPath,
  [entry, "licenses", "list", "--prod", "--json"],
  { encoding: "utf8", shell: false },
);
if (result.status !== 0)
  throw new Error(result.stderr || "License inventory failed");
const groups = JSON.parse(result.stdout);
for (const [license, dependencies] of Object.entries(groups)) {
  if (!allowed.has(license))
    throw new Error(
      `Review unapproved runtime license ${license}: ${dependencies.map((d) => d.name).join(", ")}`,
    );
}
console.log(
  `Approved runtime dependency licenses (${Object.values(groups).flat().length} packages).`,
);
