import { readdir, readFile } from "node:fs/promises";
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      ),
    )
  ).flat();
}
const paths = (await files("packages/server")).filter(
  (p) =>
    /\.(ts|js)$/.test(p) &&
    !p.includes("/dist/") &&
    !p.includes("/node_modules/") &&
    !p.includes("/generated/"),
);
const graph = new Map();
for (const path of paths) {
  const text = await readFile(path, "utf8");
  if (text.split("\n").length > 400)
    throw new Error(`${path} exceeds 400 lines`);
  if (
    /\/(lexicon|workflows)\//.test(path) &&
    /from ['"].*(mcp|transport|cli)\b/.test(text)
  )
    throw new Error(`Invalid dependency in ${path}`);
  graph.set(
    path,
    [...text.matchAll(/from ['"](\.[^'"]+)['"]/g)].map((m) =>
      new URL(m[1].replace(/\.js$/, ".ts"), `file:///${path}`).pathname.slice(
        1,
      ),
    ),
  );
}
function visit(path, stack = new Set(), done = new Set()) {
  if (stack.has(path)) throw new Error(`Circular import ${path}`);
  if (done.has(path)) return;
  stack.add(path);
  for (const dep of graph.get(path) ?? []) visit(dep, stack, done);
  stack.delete(path);
  done.add(path);
}
for (const path of graph.keys()) visit(path);
console.log(`Architecture and size checks passed (${paths.length} files)`);
