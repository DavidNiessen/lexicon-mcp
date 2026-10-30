import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { MAX_PREVIEW_ROWS, previewFor } from "../src/ui/model.js";
import { PREVIEW_MIME, previewResource } from "../src/ui/document.js";

const plan = {
  id: "example-plan",
  status: "pending",
  operations: [
    {
      tool: "lexicon_update_track",
      input: { id: 7, edits: { title: "Clean title", rating: "+1" } },
    },
  ],
  before: [
    {
      track: { id: 7, artist: "Artist", title: " Original title ", rating: 3 },
    },
  ],
};

it("shows each changed field with its before value and expected relative value", () => {
  const preview = previewFor({ reviewRequired: true, plan })!;
  expect(preview.columns).toEqual([
    "Track / target",
    "Field",
    "Before",
    "After",
  ]);
  expect(preview.rows[0]).toEqual([
    "Artist —  Original title ",
    "title",
    " Original title ",
    "Clean title",
  ]);
  expect(preview.rows[1]?.slice(1)).toEqual(["rating", "3", "4"]);
  expect(preview.note).toContain("No chat confirmation");
});

it("makes whitespace-only edits visibly distinct with quoted values", () => {
  const preview = previewFor({
    operations: [
      {
        tool: "lexicon_update_track",
        input: {
          id: 7,
          edits: { title: "Orbit (Original Mix)", genre: "Hard Techno" },
        },
      },
    ],
    before: [
      {
        track: {
          id: 7,
          title: " Orbit (Original Mix) ",
          genre: "Hard   Techno",
        },
      },
    ],
  })!;
  expect(preview.rows[0]?.slice(2)).toEqual([
    '" Orbit (Original Mix) "',
    '"Orbit (Original Mix)"',
  ]);
  expect(preview.rows[1]?.slice(2)).toEqual([
    '"Hard   Techno"',
    '"Hard Techno"',
  ]);
  expect(previewResource(preview).resource.text).toContain(
    "white-space:pre-wrap",
  );
});

it("renders health, duplicates, playlist comparisons, set order and nested job pages", () => {
  expect(
    previewFor({
      findings: [{ trackId: 1, issue: "missing_cues" }],
      scanned: 10,
      total: 1,
    })?.title,
  ).toBe("Library health");
  expect(
    previewFor({
      candidates: [
        { trackIds: [1, 2], confidence: "medium", reason: "Similar metadata" },
      ],
      scanned: 10,
    })?.title,
  ).toBe("Duplicate candidates");
  expect(
    previewFor({
      result: {
        tracks: [
          {
            id: 1,
            title: "Track",
            artist: "Artist",
            bpm: 128,
            key: "8A",
            reasons: ["Tempo match"],
          },
        ],
        durationSeconds: 300,
      },
    })?.rows[0],
  ).toEqual(["1", "Artist — Track", "128 / 8A", '["Tempo match"]']);
  expect(
    previewFor({ memberships: [{ trackId: 1, playlistIds: [2, 3] }] })?.title,
  ).toBe("Compare playlist membership");
  expect(
    previewFor({ state: "running", progress: { completed: 10, total: 20 } })
      ?.status,
  ).toBe("running");
  expect(previewFor({ value: "ordinary result" })).toBeUndefined();
});

it("bounds preview rows and cell text while preserving the full reported total", () => {
  const preview = previewFor({
    findings: Array.from({ length: 500 }, (_, i) => ({
      trackId: i,
      issue: "x".repeat(1000),
    })),
    total: 500,
  })!;
  expect(preview.rows.length).toBeLessThanOrEqual(MAX_PREVIEW_ROWS);
  expect(preview.rows.length).toBeGreaterThan(0);
  expect(preview.total).toBe(500);
  expect(preview.rows[0]?.[1]?.length).toBeLessThanOrEqual(401);
  const longUnicode = previewFor({
    findings: Array.from({ length: 500 }, () => ({
      trackId: 1,
      issue: "曲".repeat(1000),
      label: "曲".repeat(1000),
    })),
    total: 500,
  })!;
  expect(Buffer.byteLength(JSON.stringify(longUnicode))).toBeLessThanOrEqual(
    80000,
  );
});

it("escapes script delimiters and ships CSP hashes without remote assets or inline event handlers", () => {
  const dangerous = '</script><img src=x onerror="alert(1)">';
  const preview = previewFor({
    ...plan,
    operations: [
      {
        tool: "lexicon_update_track",
        input: { id: 7, edits: { title: dangerous } },
      },
    ],
  })!;
  const ui = previewResource(preview);
  expect(ui.resource.mimeType).toBe(PREVIEW_MIME);
  const html = ui.resource.text!;
  expect(html).not.toContain(dangerous);
  const initial = html
    .split('<script id="initial" type="application/json">')[1]!
    .split("</script>")[0]!;
  expect(JSON.parse(initial).rows[0][3]).toBe(dangerous);
  expect(html).toContain("connect-src 'none'");
  expect(html).not.toContain("'unsafe-inline'");
  expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|onclick=/);
  expect(html).not.toContain("lexicon_apply_change_plan");
  expect(html).toContain('id="apply-changes"');
  expect(html).toContain('id="cancel-changes"');
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    expect(html).toContain(
      createHash("sha256").update(match[1]!).digest("base64"),
    );
  }
});

it("provides a self-contained MCP Apps bridge for host result hydration", () => {
  const ui = previewResource(undefined, true);
  expect(ui.resource.text).toContain("ui/initialize");
  expect(ui.resource.text).toContain("ui/notifications/tool-result");
  expect(ui.resource.text).toContain("lexicon/preview");
  expect(ui.resource._meta).toMatchObject({
    ui: { csp: { connectDomains: [], resourceDomains: [] } },
  });
});
