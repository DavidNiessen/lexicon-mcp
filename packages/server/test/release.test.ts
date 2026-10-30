import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  chooseVersion,
  normalizeVersion,
  releaseHistory,
  stampVersion,
} from "../../../scripts/release-version.mjs";

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
const choose = (subject: string, body = "") =>
  chooseVersion({
    current: "0.1.0",
    tags: ["v1.2.3"],
    commits: [{ subject, body }],
  }).next;
it("uses the checked-in version for an initial release", () => {
  expect(
    chooseVersion({
      current: "0.1.0",
      commits: [{ subject: "feat: first release" }],
    }).next,
  ).toBe("0.1.0");
});
it("chooses patch, minor, and major from Conventional Commits", () => {
  expect(choose("fix(api): correct search")).toBe("1.2.4");
  expect(choose("feat(api): add search")).toBe("1.3.0");
  expect(choose("feat(api)!: change search")).toBe("2.0.0");
  expect(choose("refactor: simplify", "BREAKING CHANGE: new schema")).toBe(
    "2.0.0",
  );
  expect(choose("refactor: simplify", "BREAKING-CHANGE: new schema")).toBe(
    "2.0.0",
  );
});
it("uses numeric tag order, excludes prerelease baselines and prioritizes breaking changes", () => {
  expect(
    chooseVersion({
      current: "0.1.0",
      tags: ["v1.9.9", "v1.10.0", "v2.0.0-rc.1"],
      commits: [{ subject: "fix: correction" }],
    }).next,
  ).toBe("1.10.1");
  expect(
    chooseVersion({
      current: "0.1.0",
      tags: ["v1.0.0"],
      commits: [{ subject: "feat: added" }, { subject: "fix!: changed" }],
    }).next,
  ).toBe("2.0.0");
});
it("honors manual versions and rejects malformed or injectable input", () => {
  expect(
    chooseVersion({ current: "0.1.0", manual: " v3.0.0-rc.1 " }).next,
  ).toBe("3.0.0-rc.1");
  expect(normalizeVersion("2.0.0")).toBe("2.0.0");
  for (const input of [
    "01.0.0",
    "1.0",
    "1.0.0-01",
    "v1.0.0; whoami",
    "../main",
  ])
    expect(() => normalizeVersion(input)).toThrow("SemVer");
  expect(() => chooseVersion({ current: "0.1.0", tags: ["v0.1.0"] })).toThrow(
    "No unreleased",
  );
});
it("reads real git history since the last reachable release tag", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "lexicon-release-"));
  folders.push(cwd);
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8" });
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Test"]);
  git(["config", "user.email", "test@example.invalid"]);
  git(["commit", "--allow-empty", "-m", "feat: initial"]);
  git(["tag", "v1.2.3"]);
  expect(releaseHistory(cwd).commits).toHaveLength(0);
  git(["commit", "--allow-empty", "-m", "feat: add a tool"]);
  git([
    "commit",
    "--allow-empty",
    "-m",
    "refactor: schema",
    "-m",
    "BREAKING CHANGE: schema changed",
  ]);
  const history = releaseHistory(cwd);
  expect(history.commits).toHaveLength(2);
  expect(chooseVersion({ current: "1.2.3", ...history }).next).toBe("2.0.0");
});
it("stamps all manifests and the runtime with one validated version", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "lexicon-release-"));
  folders.push(cwd);
  await mkdir(join(cwd, "packages/server/src"), { recursive: true });
  await mkdir(join(cwd, "packages/companion"), { recursive: true });
  const paths = [
    "package.json",
    "packages/server/package.json",
    "packages/companion/package.json",
  ];
  for (const path of paths)
    await writeFile(
      join(cwd, path),
      JSON.stringify({ name: path, version: "0.1.0" }),
    );
  await stampVersion("v2.3.4-rc.2", cwd);
  for (const path of paths)
    expect(JSON.parse(await readFile(join(cwd, path), "utf8")).version).toBe(
      "2.3.4-rc.2",
    );
  expect(
    await readFile(join(cwd, "packages/server/src/version.ts"), "utf8"),
  ).toContain('export const VERSION = "2.3.4-rc.2";');
});
