import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const folder = new URL("../packages/companion/plugin/", import.meta.url);
const config = JSON.parse(
  await readFile(new URL("config.json", folder), "utf8"),
);
assert.equal(config.id, "dev.niessen.lexicon-mcp");
assert.ok(config.author.email || config.author.discordUsername);
assert.equal(
  new Set(config.actions.map((action) => action.id)).size,
  config.actions.length,
);
for (const action of config.actions) {
  const source = await readFile(new URL(`${action.id}.js`, folder), "utf8");
  assert.doesNotMatch(
    source,
    /\brequire\s*\(|^\s*import\s|\b(?:window|document)\s*\./m,
  );
  assert.doesNotMatch(
    JSON.stringify(action.config.permissions),
    /"(?:modify|create|delete|network|control)"/,
  );
  for (const selected of [
    [],
    [
      {
        id: 1,
        title: "Synthetic title",
        artist: "Synthetic artist",
        name: "Synthetic playlist",
      },
    ],
  ]) {
    const reports = [];
    vm.runInNewContext(
      source,
      {
        _vars: { tracksSelected: selected, playlistsSelected: selected },
        _helpers: { Report: (value) => reports.push(value) },
        _musicplayer: {
          getNowPlaying: () => selected[0] || null,
          getQueue: () => selected,
          getCurrentTime: () => 12,
          getBpm: () => 128,
        },
      },
      { timeout: 1000 },
    );
    assert.ok(reports.length > 0);
  }
}
console.log(`Validated ${config.actions.length} read-only companion actions.`);
