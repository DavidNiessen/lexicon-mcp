// Read-only Conventional Commit version recommendation. The release PR applies the result.
import { execFileSync } from "node:child_process";
const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const tags = git(["tag", "--merged", "HEAD", "--sort=-version:refname"]).split(
  "\n",
);
const previous = tags.find((value) => /^v\d+\.\d+\.\d+$/.test(value));
const history = git([
  "log",
  "--no-merges",
  "--format=%s%n%b",
  ...(previous ? [`${previous}..HEAD`] : []),
]);
const current = (previous || "v0.0.0").slice(1).split(".").map(Number);
const breaking = /^[a-z]+(?:\([^\n]+\))?!:|^BREAKING[ -]CHANGE:/m.test(history);
const feature = /^feat(?:\([^\n]+\))?:/m.test(history);
if (history) {
  if (breaking) {
    current[0]++;
    current[1] = 0;
    current[2] = 0;
  } else if (feature) {
    current[1]++;
    current[2] = 0;
  } else current[2]++;
}
console.log(
  JSON.stringify(
    { previous: previous || null, next: current.join("."), breaking, feature },
    null,
    2,
  ),
);
