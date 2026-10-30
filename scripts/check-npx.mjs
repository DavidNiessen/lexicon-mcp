import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

if (!process.argv[2]) throw new Error("Pass the packaged .tgz path.");
const tarball = await readFile(path.resolve(process.argv[2]));
const npmCli =
  process.argv[3] ??
  path.join(
    path.dirname(process.execPath),
    process.platform === "win32"
      ? "node_modules/npm/bin/npm-cli.js"
      : "../lib/node_modules/npm/bin/npm-cli.js",
  );
const npxCli = path.join(path.dirname(npmCli), "npx-cli.js");
const directory = await mkdtemp(path.join(tmpdir(), "lexicon-npx-url-"));
const project = path.join(directory, "project");
await mkdir(project);
let requests = 0;
const server = createServer((request, response) => {
  if (
    request.url !== "/lexicon-mcp.tgz" ||
    !["GET", "HEAD"].includes(request.method ?? "")
  ) {
    response.writeHead(404);
    response.end();
    return;
  }
  requests++;
  response.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": tarball.length,
  });
  response.end(request.method === "HEAD" ? undefined : tarball);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
try {
  const url = `http://127.0.0.1:${server.address().port}/lexicon-mcp.tgz`;
  const env = {
    ...process.env,
    npm_config_cache: path.join(directory, "cache"),
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
    LEXICON_DATA_DIR: path.join(directory, "data"),
    LEXICON_READ_ONLY: "true",
    LEXICON_BASE_URL: "http://127.0.0.1:1/v1",
  };
  // Use the documented direct-URL npx form, rather than npm exec --package.
  const child = spawn(
    process.execPath,
    [
      npxCli,
      "--yes",
      url,
      "install",
      "--agent",
      "cursor",
      "--scope",
      "project",
      "--dry-run",
      "--yes",
    ],
    { cwd: project, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (data) => {
    stdout += data;
  });
  child.stderr.on("data", (data) => {
    stderr += data;
  });
  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Direct-URL npx smoke timed out."));
    }, 60000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (value) => {
      clearTimeout(timeout);
      resolve(value);
    });
  });
  assert.equal(code, 0, `Direct-URL npx failed: ${stderr}\n${stdout}`);
  assert.ok(requests > 0, "npx did not fetch the tarball URL.");
  assert.match(
    stdout,
    /Dry run: no files were written\./,
    "npx did not execute the installer dry run.",
  );
  assert.deepEqual(await readdir(project), [], "Dry run wrote project files.");
  assert.equal(
    await readdir(path.join(directory, "data")).then(
      () => true,
      () => false,
    ),
    false,
    "Dry run wrote runtime files.",
  );
  console.log(
    "Direct-URL npx installer smoke passed; no agent configuration or runtime files written.",
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  // Only remove the exact temporary directory generated for this smoke test.
  assert.ok(directory.startsWith(path.join(tmpdir(), "lexicon-npx-url-")));
  await rm(directory, { recursive: true, force: true });
}
