import { build } from "esbuild";
import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc"], {
  stdio: "inherit",
});
await build({
  entryPoints: ["packages/server/src/cli.ts"],
  outfile: "packages/server/dist/cli.cjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  banner: { js: "#!/usr/bin/env node" },
  external: [],
});
