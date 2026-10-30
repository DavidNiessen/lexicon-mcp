// Opt-in, read-only probe. This script never sends mutations or control commands.
const base = process.env.LEXICON_BASE_URL || "http://127.0.0.1:48624/v1";
const endpoint = new URL(base);
if (!["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)) {
  throw new Error("Live smoke test requires a loopback Lexicon URL.");
}
for (const path of [
  "/tracks?limit=1&fields=id",
  "/playlists",
  "/tags",
  "/playing",
  "/queue",
]) {
  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok)
    throw new Error(`${path.split("?")[0]} returned HTTP ${response.status}`);
  const data = await response.json();
  if (!data || typeof data !== "object" || !("data" in data))
    throw new Error("Unexpected response envelope.");
  console.log(`${path.split("?")[0]}: reachable (response contents withheld)`);
}
