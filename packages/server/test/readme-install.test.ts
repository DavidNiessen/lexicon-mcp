import { expect, it, vi } from "vitest";
import {
  currentInstall,
  installTarget,
  replaceInstall,
  stableUnavailable,
} from "../../../scripts/readme-install.mjs";
import { updateReadmeInstall } from "../../../scripts/update-readme-install.mjs";

const repository = "DavidNiessen/lexicon-mcp";
const command = (tag: string) =>
  installTarget({
    repository,
    tag,
    type: tag.includes("-") ? "prerelease" : "release",
  }).command;
const block = (type: string, content: string) =>
  `<!-- install:${type}:start -->\n\n${content}\n\n<!-- install:${type}:end -->`;
const fenced = (tag: string) => `\`\`\`sh\n${command(tag)}\n\`\`\``;
function readme(stable = fenced("v1.0.0")) {
  return [
    "# Lexicon MCP — 曲",
    "![Preview](docs/images/library-preview.png)",
    "Keep https://example.com/v1.0.0 and all other prose untouched.",
    block("release", stable),
    block("prerelease", fenced("v1.1.0-rc.1")),
    "## Setup\nExisting onboarding stays unchanged.\n",
  ].join("\n\n");
}
function masked(source: string, type: string) {
  const start = source.indexOf(`<!-- install:${type}:start -->`);
  const end = source.indexOf(`<!-- install:${type}:end -->`);
  return source.slice(0, start) + "MANAGED" + source.slice(end);
}

it.each([
  ["release", "v2.0.0"],
  ["prerelease", "v2.0.0-rc.2"],
])(
  "updates only the %s command and preserves every byte outside it",
  (type, tag) => {
    for (const eol of ["\n", "\r\n"]) {
      const before = readme().replaceAll("\n", eol);
      const after = replaceInstall(before, { repository, tag, type });
      expect(masked(after, type)).toBe(masked(before, type));
      expect(currentInstall(after, type)?.tag).toBe(tag);
      expect(after).toContain(`\`\`\`sh${eol}${command(tag)}${eol}\`\`\``);
      expect(replaceInstall(after, { repository, tag, type })).toBe(after);
    }
  },
);

it("replaces only the initial stable-unavailable note when the first stable release appears", () => {
  const before = readme(stableUnavailable);
  const after = replaceInstall(before, {
    repository,
    tag: "v0.1.0",
    type: "release",
  });
  expect(masked(after, "release")).toBe(masked(before, "release"));
  expect(after).not.toContain(stableUnavailable);
  expect(after).toContain(fenced("v0.1.0"));
});

it("uses the selected channel even for a manually flagged prerelease with a stable-looking version", () => {
  const before = readme();
  const after = replaceInstall(before, {
    repository,
    tag: "v2.0.0",
    type: "prerelease",
  });
  expect(masked(after, "prerelease")).toBe(masked(before, "prerelease"));
  expect(currentInstall(after, "prerelease")?.tag).toBe("v2.0.0");
});

it("rejects missing, duplicated, inline, reversed, overlapping, or unexpected managed content", () => {
  const original = readme();
  const start = "<!-- install:release:start -->";
  const end = "<!-- install:release:end -->";
  const invalid = [
    original.replace(start, ""),
    original + "\n" + start,
    original.replace(start, `prefix ${start}`),
    original.replace(start, "TEMP").replace(end, start).replace("TEMP", end),
    original
      .replace(end, "")
      .replace(
        "<!-- install:prerelease:end -->",
        `<!-- install:prerelease:end -->\n${end}`,
      ),
    original.replace(
      fenced("v1.0.0"),
      fenced("v1.0.0") + "\nDo not erase this addition.",
    ),
    original.replace("lexicon-mcp-1.0.0.tgz", "lexicon-mcp-9.0.0.tgz"),
  ];
  for (const source of invalid)
    expect(() =>
      replaceInstall(source, { repository, tag: "v2.0.0", type: "release" }),
    ).toThrow();
  expect(original).toBe(readme());
});

it("rejects invalid repositories, versions, channels, and prerelease versions for stable releases", () => {
  for (const options of [
    { repository: "owner/repo?ref=evil", tag: "v1.0.0", type: "release" },
    { repository, tag: "v1.0.0; whoami", type: "release" },
    { repository, tag: "v1.0.0-rc.1", type: "release" },
    { repository, tag: "v1.0.0", type: "other" },
  ])
    expect(() => replaceInstall(readme(), options)).toThrow();
});

const options = { repository, tag: "v2.0.0-rc.2", type: "prerelease" };
const release = (tag = options.tag, publishedAt = "2026-10-30T10:00:00Z") => ({
  tag_name: tag,
  draft: false,
  prerelease: true,
  published_at: publishedAt,
  assets: [
    { name: `lexicon-mcp-${tag.slice(1)}.tgz`, state: "uploaded", size: 100 },
  ],
});
const file = (source: string, sha = "a".repeat(40)) => ({
  type: "file",
  path: "README.md",
  encoding: "base64",
  sha,
  content: Buffer.from(source).toString("base64"),
});

it("re-fetches latest main after a content-SHA conflict and preserves concurrent README edits", async () => {
  const latest = readme().replace(
    "Existing onboarding",
    "Someone's new onboarding",
  );
  const writes: any[] = [];
  let reads = 0;
  const request = vi.fn(
    async (method: string, endpoint: string, body?: any) => {
      if (endpoint.includes("releases/tags/v2.0.0-rc.2")) return release();
      if (endpoint.includes("releases/tags/v1.1.0-rc.1"))
        return release("v1.1.0-rc.1", "2026-10-29T10:00:00Z");
      if (method === "GET")
        return file(
          ++reads === 1 ? readme() : latest,
          (reads === 1 ? "a" : "b").repeat(40),
        );
      writes.push(body);
      if (writes.length === 1)
        throw Object.assign(new Error("Conflict"), { status: 409 });
      return { commit: { sha: "c".repeat(40) } };
    },
  );
  await expect(updateReadmeInstall(options, request)).resolves.toEqual({
    status: "updated",
    tag: options.tag,
  });
  expect(reads).toBe(2);
  expect(writes).toHaveLength(2);
  expect(writes[1].sha).toBe("b".repeat(40));
  expect(writes[1].branch).toBe("main");
  expect(writes[1].message).toBe(
    "docs(readme): update prerelease install command [skip ci]",
  );
  const updated = Buffer.from(writes[1].content, "base64").toString("utf8");
  expect(masked(updated, "prerelease")).toBe(masked(latest, "prerelease"));
  expect(
    request.mock.calls
      .filter(([method]) => method === "PUT")
      .every(([, endpoint]) => endpoint.endsWith("/contents/README.md")),
  ).toBe(true);
});

it("preserves a newer published command when an older release job is rerun", async () => {
  const source = replaceInstall(readme(), { ...options, tag: "v2.0.0-rc.3" });
  const request = vi.fn(async (_method: string, endpoint: string) => {
    if (endpoint.includes("releases/tags/v2.0.0-rc.2")) return release();
    if (endpoint.includes("releases/tags/v2.0.0-rc.3"))
      return release("v2.0.0-rc.3", "2026-10-30T11:00:00Z");
    return file(source);
  });
  await expect(updateReadmeInstall(options, request)).resolves.toEqual({
    status: "newer-command-preserved",
    tag: "v2.0.0-rc.3",
  });
  expect(request.mock.calls.some(([method]) => method === "PUT")).toBe(false);
});

it.each([
  { ...release(), draft: true },
  { ...release(), prerelease: false },
  { ...release(), assets: [] },
  { ...release(), tag_name: "v2.0.0-rc.9" },
])(
  "does not touch README before a matching package is published (%j)",
  async (value) => {
    const request = vi.fn(async () => value);
    await expect(updateReadmeInstall(options, request)).rejects.toThrow(
      "published",
    );
    expect(request).toHaveBeenCalledOnce();
  },
);

it("does not create another commit for an already current command", async () => {
  const source = replaceInstall(readme(), options);
  const request = vi.fn(async (_method: string, endpoint: string) =>
    endpoint.includes("releases/tags") ? release() : file(source),
  );
  await expect(updateReadmeInstall(options, request)).resolves.toEqual({
    status: "unchanged",
    tag: options.tag,
  });
  expect(request.mock.calls.some(([method]) => method === "PUT")).toBe(false);
});

it("publishes the first stable command while preserving the prerelease block and onboarding", async () => {
  const source = readme(stableUnavailable);
  const writes: any[] = [];
  const stable = { repository, tag: "v2.0.0", type: "release" };
  const request = vi.fn(
    async (method: string, endpoint: string, body?: any) => {
      if (endpoint.includes("releases/tags"))
        return { ...release(stable.tag), prerelease: false };
      if (method === "GET") return file(source);
      writes.push(body);
      return {};
    },
  );
  await expect(updateReadmeInstall(stable, request)).resolves.toEqual({
    status: "updated",
    tag: stable.tag,
  });
  expect(writes).toHaveLength(1);
  const next = Buffer.from(writes[0].content, "base64").toString("utf8");
  expect(masked(next, "release")).toBe(masked(source, "release"));
  expect(currentInstall(next, "release")?.tag).toBe(stable.tag);
});

it.each([
  { ...file(readme()), type: "symlink" },
  file(readme().replace("<!-- install:release:start -->", "")),
  { ...file(readme()), content: Buffer.from([255, 254]).toString("base64") },
])("refuses unsafe README input before a write", async (value) => {
  const request = vi.fn(async (_method: string, endpoint: string) =>
    endpoint.includes("releases/tags") ? release() : value,
  );
  await expect(updateReadmeInstall(options, request)).rejects.toThrow();
  expect(request.mock.calls.some(([method]) => method === "PUT")).toBe(false);
});

it("bounds conflict retries and never retries permission failures", async () => {
  for (const status of [409, 403]) {
    const request = vi.fn(async (method: string, endpoint: string) => {
      if (endpoint.includes("releases/tags/v2.0.0-rc.2")) return release();
      if (endpoint.includes("releases/tags/v1.1.0-rc.1"))
        throw Object.assign(new Error("Gone"), { status: 404 });
      if (method === "GET") return file(readme());
      throw Object.assign(new Error("Write rejected"), { status });
    });
    await expect(updateReadmeInstall(options, request)).rejects.toThrow(
      "Write rejected",
    );
    expect(
      request.mock.calls.filter(([method]) => method === "PUT"),
    ).toHaveLength(status === 409 ? 3 : 1);
  }
});
