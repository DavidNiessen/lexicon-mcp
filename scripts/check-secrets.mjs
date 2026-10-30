import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const patterns = [
  new RegExp("gh[pousr]_" + "[A-Za-z0-9]{30,}"),
  new RegExp("github_pat_" + "[A-Za-z0-9_]{60,}"),
  new RegExp("-----BEGIN " + "(?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
];
for (const file of files) {
  const source = await readFile(file, "utf8");
  if (patterns.some((pattern) => pattern.test(source)))
    throw new Error(`Possible secret in ${file}.`);
}
console.log(
  `Scanned ${files.length} tracked files for common credential patterns.`,
);
