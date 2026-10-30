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
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8, unzipSync } from "fflate";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  await readFile(path.join(root, "packages/server/package.json"), "utf8"),
);
const platform = `${process.platform}-${process.arch}`;
const out = path.join(root, "release", `${manifest.version}-${platform}`);
const stage = path.join(
  root,
  "work",
  "package",
  `${manifest.version}-${platform}`,
);
await mkdir(out, { recursive: true });
await mkdir(stage, { recursive: true });
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} failed: ${result.stderr || result.error || result.stdout}`,
    );
  return result.stdout;
}
const stamp = new Date("2026-01-01T00:00:00Z");
function zip(files) {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [
        name,
        [bytes, { mtime: stamp }],
      ]),
    ),
  );
}
const pluginDir = path.join(root, "packages/companion/plugin");
const pluginFiles = {};
for (const name of await readdir(pluginDir))
  pluginFiles[name] = await readFile(path.join(pluginDir, name));
const companionZip = zip(pluginFiles);
const archive = unzipSync(companionZip);
const pluginConfig = JSON.parse(
  new TextDecoder().decode(archive["config.json"]),
);
for (const action of pluginConfig.actions) {
  if (!archive[`${action.id}.js`])
    throw new Error(`Missing plugin action ${action.id}`);
}
await writeFile(
  path.join(out, `lexicon-mcp-companion-${manifest.version}.zip`),
  companionZip,
);

// All runtime dependencies are bundled. Package the bundle with its own license and guide.
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
for (const file of ["README.md", "LICENSE"])
  await copyFile(path.join(root, file), path.join(npmStage, file));
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
        "LICENSE",
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
// npm's JS entrypoint avoids shell interpolation on Windows.
const npmLocation = process.env.npm_execpath?.endsWith("npm-cli.js")
  ? process.env.npm_execpath
  : path.join(
      path.dirname(process.execPath),
      process.platform === "win32"
        ? "node_modules/npm/bin/npm-cli.js"
        : "../lib/node_modules/npm/bin/npm-cli.js",
    );

const notices = [
  "Lexicon MCP — MIT",
  await readFile(path.join(root, "LICENSE"), "utf8"),
];
const components = [
  {
    type: "application",
    name: "node",
    version: process.versions.node,
    licenses: [{ license: { id: "MIT" } }],
  },
];
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
      )) {
        notices.push(
          await readFile(path.join(dir, license), "utf8").catch(() => ""),
        );
      }
    }
  }
}
const runtimeLicense = await fetch(
  `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`,
);
if (!runtimeLicense.ok)
  throw new Error("Could not obtain the exact bundled Node license.");
notices.push(`\nNode.js ${process.version}\n${await runtimeLicense.text()}`);
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
const noticeText = notices.join("\n");
await writeFile(path.join(out, "sbom.cdx.json"), sbom);
await writeFile(path.join(out, "THIRD-PARTY-NOTICES.txt"), noticeText);
await writeFile(path.join(npmStage, "sbom.cdx.json"), sbom);
await writeFile(path.join(npmStage, "THIRD-PARTY-NOTICES.txt"), noticeText);
run(
  process.execPath,
  [npmLocation, "pack", "--pack-destination", out, "--ignore-scripts"],
  npmStage,
);
const packedName = `${manifest.name.replace(/^@/, "").replaceAll("/", "-")}-${manifest.version}.tgz`;
await rename(
  path.join(out, packedName),
  path.join(out, packedName.replace(/\.tgz$/, `-${platform}.tgz`)),
);

if (!["win32-x64", "darwin-arm64", "darwin-x64"].includes(platform)) {
  console.log(
    `Skipping desktop executable on ${platform}; Node package and plugin are available.`,
  );
} else {
  const executable = path.join(
    stage,
    process.platform === "win32" ? "lexicon-mcp.exe" : "lexicon-mcp",
  );
  const blob = path.join(stage, "sea.blob");
  const config = path.join(stage, "sea.json");
  await writeFile(
    config,
    JSON.stringify({
      main: path.join(root, "packages/server/dist/cli.cjs"),
      output: blob,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
    }),
  );
  run(process.execPath, ["--experimental-sea-config", config]);
  await copyFile(process.execPath, executable);
  if (process.platform === "darwin")
    run("codesign", ["--remove-signature", executable]);
  const postject = path.join(root, "node_modules/postject/dist/cli.js");
  const args = [
    postject,
    executable,
    "NODE_SEA_BLOB",
    blob,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ];
  if (process.platform === "darwin")
    args.push("--macho-segment-name", "NODE_SEA");
  run(process.execPath, args);
  await chmod(executable, 0o755);
  if (process.platform === "darwin")
    run("codesign", ["--sign", "-", executable]);
  const versionOutput = run(executable, ["--version"]);
  if (!versionOutput.includes(manifest.version))
    throw new Error("Packaged executable version smoke check failed.");
  const files = {
    [path.basename(executable)]: [
      await readFile(executable),
      { mtime: stamp, attrs: 0o100755 << 16 },
    ],
    "README.md": strToU8(await readFile(path.join(root, "README.md"), "utf8")),
    LICENSE: strToU8(await readFile(path.join(root, "LICENSE"), "utf8")),
    "THIRD-PARTY-NOTICES.txt": strToU8(noticeText),
    "sbom.cdx.json": strToU8(sbom),
  };
  await writeFile(
    path.join(out, `lexicon-mcp-${manifest.version}-${platform}.zip`),
    zipSync(files),
  );
}
const sums = [];
for (const file of (await readdir(out))
  .filter((name) => name !== "SHA256SUMS")
  .sort()) {
  sums.push(
    `${createHash("sha256")
      .update(await readFile(path.join(out, file)))
      .digest("hex")}  ${file}`,
  );
}
await writeFile(path.join(out, "SHA256SUMS"), `${sums.join(os.EOL)}${os.EOL}`);
console.log(`Release artifacts: ${out}`);
