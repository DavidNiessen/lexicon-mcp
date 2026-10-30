import { appendFile, readFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chooseVersion,
  normalizeVersion,
  releaseHistory,
  stampVersion,
} from "./release-version.mjs";

const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const emit = async (tag) => {
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
  console.log(`Prepared private release ${tag}`);
};
if (process.env.GITHUB_REF !== "refs/heads/main")
  throw new Error("Dispatch releases from main.");
if (
  execFileSync(
    "gh",
    ["repo", "view", "--json", "isPrivate", "--jq", ".isPrivate"],
    { encoding: "utf8" },
  ).trim() !== "true"
)
  throw new Error("Releases require a private repository.");
if (git(["status", "--porcelain"]))
  throw new Error("Release preparation requires a clean checkout.");
const manual = process.env.RELEASE_TAG?.trim() ?? "";
const manifest = JSON.parse(
  await readFile("packages/server/package.json", "utf8"),
);
if (manual) {
  const tag = `v${normalizeVersion(manual)}`;
  if (
    spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/tags/${tag}`])
      .status === 0
  ) {
    git(["checkout", "--detach", tag]);
    execFileSync(process.execPath, ["scripts/check-release.mjs"], {
      env: { ...process.env, RELEASE_TAG: tag },
      stdio: "inherit",
    });
    await emit(tag);
    process.exit(0);
  }
}
const selection = chooseVersion({
  current: manifest.version,
  ...releaseHistory(),
  manual,
});
const tag = `v${selection.next}`;
if (
  spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/tags/${tag}`])
    .status === 0
)
  throw new Error(`Tag ${tag} already exists; choose a different version.`);
await stampVersion(selection.next);
for (const script of ["check", "test", "build"])
  execFileSync("pnpm", ["run", script], { stdio: "inherit" });
git(["config", "user.name", "github-actions[bot]"]);
git([
  "config",
  "user.email",
  "41898282+github-actions[bot]@users.noreply.github.com",
]);
git([
  "add",
  "package.json",
  "packages/server/package.json",
  "packages/companion/package.json",
  "packages/server/src/version.ts",
]);
if (git(["diff", "--cached", "--name-only"]))
  git(["commit", "-m", `chore(release): prepare ${tag}`]);
git(["tag", "-a", tag, "-m", `Lexicon MCP ${tag}`]);
// Atomic push prevents a source-branch race from leaving an orphan release tag.
git(["push", "--atomic", "origin", "HEAD:refs/heads/main", `refs/tags/${tag}`]);
await emit(tag);
