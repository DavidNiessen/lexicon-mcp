import { execFileSync } from "node:child_process";
const base = process.env.BASE_REF;
if (!base || !/^[a-f0-9]{40}$/.test(base))
  throw new Error("BASE_REF must be a full commit SHA.");
const subjects = execFileSync(
  "git",
  ["log", "--no-merges", "--format=%s", `${base}..HEAD`],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);
for (const subject of subjects) {
  if (
    !/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._/-]+\))?!?: .+/.test(
      subject,
    )
  ) {
    throw new Error(`Commit does not follow Conventional Commits: ${subject}`);
  }
}
console.log(`Validated ${subjects.length} commit subjects.`);
