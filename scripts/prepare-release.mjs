import { appendFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { releaseHistory, selectReleaseVersion } from "./release-version.mjs";

if (process.env.GITHUB_REF !== "refs/heads/main")
  throw new Error("Publish releases from main.");
const { version: current } = JSON.parse(
  await readFile("packages/server/package.json", "utf8"),
);
const selected = selectReleaseVersion({
  current,
  ...releaseHistory(),
  manual: process.env.RELEASE_TAG ?? "",
  type: process.env.RELEASE_TYPE ?? "prerelease",
  runId: process.env.GITHUB_RUN_ID,
  attempt: process.env.GITHUB_RUN_ATTEMPT,
});
const sha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (process.env.GITHUB_OUTPUT)
  await appendFile(process.env.GITHUB_OUTPUT, `tag=v${selected}\nsha=${sha}\n`);
console.log(
  `Selected ${process.env.RELEASE_TYPE ?? "prerelease"}: v${selected} from ${sha}`,
);
