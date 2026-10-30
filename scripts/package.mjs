import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  await readFile(path.join(root, "packages/server/package.json"), "utf8"),
);
const out = path.join(root, "release", manifest.version);
const stage = path.join(root, "work", "package");
await mkdir(out, { recursive: true });
await mkdir(stage, { recursive: true });
function run(command, args, cwd = root, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    env,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} failed: ${result.stderr || result.error || result.stdout}`,
    );
  return result.stdout;
}
const npmLocation = process.env.npm_execpath?.endsWith("npm-cli.js")
  ? process.env.npm_execpath
  : path.join(
      path.dirname(process.execPath),
      process.platform === "win32"
        ? "node_modules/npm/bin/npm-cli.js"
        : "../lib/node_modules/npm/bin/npm-cli.js",
    );
const npmStage = await mkdtemp(path.join(stage, "npm-"));
await mkdir(path.join(npmStage, "dist"), { recursive: true });
for (const file of (
  await readdir(path.join(root, "packages/server/dist"))
).filter((name) => name.startsWith("cli.cjs"))) {
  await copyFile(
    path.join(root, "packages/server/dist", file),
    path.join(npmStage, "dist", file),
  );
}
await chmod(path.join(npmStage, "dist/cli.cjs"), 0o755);
for (const file of [
  "README.md",
  "LICENSE",
  "docs/images/library-preview.png",
]) {
  await mkdir(path.dirname(path.join(npmStage, file)), { recursive: true });
  await copyFile(path.join(root, file), path.join(npmStage, file));
}
await writeFile(
  path.join(npmStage, "package.json"),
  JSON.stringify(
    {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      license: "MIT",
      type: "commonjs",
      bin: { "lexicon-mcp": "dist/cli.cjs" },
      engines: { node: ">=24 <25" },
      files: [
        "dist",
        "README.md",
        "docs/images/library-preview.png",
        "LICENSE",
        "INSTALL.md",
        "THIRD-PARTY-NOTICES.txt",
        "sbom.cdx.json",
      ],
      repository: {
        type: "git",
        url: "git+https://github.com/DavidNiessen/lexicon-mcp.git",
      },
    },
    null,
    2,
  ),
);
const url = `https://github.com/DavidNiessen/lexicon-mcp/releases/download/v${manifest.version}/lexicon-mcp-${manifest.version}.tgz`;
const installGuide = `# Install Lexicon MCP ${manifest.version}\n\nInstall Node.js 24, start Lexicon, and enable its Local API in Settings > Integrations.\n\nRun this command and select your agents:\n\n\`\`\`sh\nnpx --yes ${url} install\n\`\`\`\n\nPreview a project installation without changes:\n\n\`\`\`sh\nnpx --yes ${url} install --agent cursor --scope project --dry-run --yes\n\`\`\`\n\nThe installer preserves existing agent settings, creates backups before changes, and installs the bundled Node program in persistent user storage. Restart selected agents after installation. MCP UI previews appear in compatible hosts; other clients retain text/JSON results.\n\nSee https://github.com/DavidNiessen/lexicon-mcp/blob/main/docs/installation.md for agent-specific paths, scope support, and updates.\n`;
await writeFile(path.join(out, "INSTALL.md"), installGuide);
await writeFile(path.join(npmStage, "INSTALL.md"), installGuide);
const notices = [
  "Lexicon MCP — MIT",
  await readFile(path.join(root, "LICENSE"), "utf8"),
];
const components = [];
const pnpmDir = path.join(root, "node_modules/.pnpm");
for (const entry of await readdir(pnpmDir).catch(() => [])) {
  const modules = path.join(pnpmDir, entry, "node_modules");
  for (const name of await readdir(modules).catch(() => [])) {
    const candidates = name.startsWith("@")
      ? (await readdir(path.join(modules, name))).map(
          (child) => `${name}/${child}`,
        )
      : [name];
    for (const candidate of candidates) {
      const dir = path.join(modules, candidate);
      const dependency = JSON.parse(
        await readFile(path.join(dir, "package.json"), "utf8").catch(
          () => "{}",
        ),
      );
      if (
        !dependency.name ||
        components.some(
          (item) =>
            item.name === dependency.name &&
            item.version === dependency.version,
        )
      )
        continue;
      components.push({
        type: "library",
        name: dependency.name,
        version: dependency.version,
        scope: "optional",
        properties: [
          { name: "lexicon-mcp:inventory", value: "build-and-runtime" },
        ],
        licenses:
          typeof dependency.license === "string"
            ? [{ license: { name: dependency.license } }]
            : [],
      });
      notices.push(
        `\n${dependency.name}@${dependency.version} (${dependency.license || "see package license"})`,
      );
      for (const license of (await readdir(dir)).filter((file) =>
        /^(licen[cs]e|copying|notice)(\.|$)/i.test(file),
      ))
        notices.push(
          await readFile(path.join(dir, license), "utf8").catch(() => ""),
        );
    }
  }
}
const sbom = JSON.stringify(
  {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      component: {
        type: "application",
        name: manifest.name,
        version: manifest.version,
      },
    },
    components: components.sort((a, b) => a.name.localeCompare(b.name)),
  },
  null,
  2,
);
for (const target of [out, npmStage]) {
  await writeFile(path.join(target, "sbom.cdx.json"), sbom);
  await writeFile(
    path.join(target, "THIRD-PARTY-NOTICES.txt"),
    notices.join("\n"),
  );
}
run(
  process.execPath,
  [npmLocation, "pack", "--pack-destination", out, "--ignore-scripts"],
  npmStage,
);
const packedName = `${manifest.name.replace(/^@/, "").replaceAll("/", "-")}-${manifest.version}.tgz`;
const tarball = path.join(out, `lexicon-mcp-${manifest.version}.tgz`);
await rename(path.join(out, packedName), tarball);
await copyFile(tarball, path.join(out, "lexicon-mcp.tgz"));
// npm exec is npx's implementation. Smoke the actual tarball in an isolated cache and project.
const smoke = await mkdtemp(path.join(stage, "npx-smoke-"));
const env = {
  ...process.env,
  npm_config_cache: path.join(smoke, "cache"),
  LEXICON_DATA_DIR: path.join(smoke, "data"),
  LEXICON_READ_ONLY: "true",
};
const project = path.join(smoke, "project");
await mkdir(project);
const args = [
  npmLocation,
  "exec",
  "--yes",
  `--package=${tarball}`,
  "--",
  "lexicon-mcp",
];
if (
  !run(process.execPath, [...args, "--version"], project, env).includes(
    manifest.version,
  )
)
  throw new Error("npx package version smoke failed");
if (
  !run(process.execPath, [...args, "--help"], project, env).includes("install")
)
  throw new Error("Installer help is absent");
run(
  process.execPath,
  [
    ...args,
    "install",
    "--agent",
    "cursor",
    "--scope",
    "project",
    "--dry-run",
    "--yes",
  ],
  project,
  env,
);
if (
  (await readdir(project)).length ||
  (await readdir(path.join(smoke, "data")).then(
    () => true,
    () => false,
  ))
)
  throw new Error("Installer dry-run wrote configuration or runtime files");
// Remove only the exact generated smoke directory, within this project's work directory.
if (!smoke.startsWith(stage + path.sep))
  throw new Error("Invalid smoke cleanup path");
await rm(smoke, { recursive: true, force: true });
run(process.execPath, [
  path.join(root, "scripts/check-npx.mjs"),
  tarball,
  npmLocation,
]);
const sums = [];
for (const file of (await readdir(out))
  .filter((name) => name !== "SHA256SUMS")
  .sort())
  sums.push(
    `${createHash("sha256")
      .update(await readFile(path.join(out, file)))
      .digest("hex")}  ${file}`,
  );
await writeFile(path.join(out, "SHA256SUMS"), sums.join("\n") + "\n");
console.log(`Platform-neutral npx package verified: ${out}`);
