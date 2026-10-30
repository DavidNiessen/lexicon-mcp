export const MAX_PREVIEW_ROWS = 100;
export const MAX_PREVIEW_TEXT = 400;

export type Preview = {
  title: string;
  description: string;
  status: string;
  columns: string[];
  rows: string[][];
  facts: [string, string][];
  total: number;
  note: string;
  plan?: { id: string; hash: string; status: string };
};

export function display(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > MAX_PREVIEW_TEXT
    ? `${text.slice(0, MAX_PREVIEW_TEXT)}…`
    : text;
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function base(title: string, description: string): Preview {
  return {
    title,
    description,
    status: "Inspection",
    columns: [],
    rows: [],
    facts: [],
    total: 0,
    note: "",
  };
}

function planPreview(data: Record<string, any>): Preview {
  const preview = base(
    "Review library changes",
    "Compare the proposed values here. Approval happens in your chat.",
  );
  preview.status = display(data.status ?? "Proposal");
  if (data.status && data.status !== "pending")
    preview.description =
      "Inspect the recorded before values and outcomes. Reconcile failed or unknown items before making another change.";
  preview.columns = ["Track / target", "Field", "Before", "After"];
  preview.facts = [["Operations", display(data.operations.length)]];
  if (data.id) preview.facts.push(["Plan", display(data.id)]);
  if (typeof data.id === "string" && typeof data.hash === "string")
    preview.plan = {
      id: data.id,
      hash: data.hash,
      status: String(data.status ?? "pending"),
    };
  let total = 0;
  for (let index = 0; index < data.operations.length; index++) {
    const op = object(data.operations[index]);
    const input = object(op.input);
    const snapshot = object(data.before?.[index]);
    const before = object(snapshot.track ?? snapshot.playlist ?? snapshot);
    const target = before.title
      ? `${before.artist ?? ""} — ${before.title}`
      : `ID ${input.id ?? display(input.ids ?? input.locations ?? "new")}`;
    const edits = object(input.edits);
    const fields = Object.keys(edits).length
      ? edits
      : Object.fromEntries(
          Object.entries(input).filter(([key]) => key !== "id"),
        );
    const entries = Object.entries(fields);
    if (!entries.length)
      entries.push([
        String(op.tool ?? "Operation").replace(/^lexicon_/, ""),
        "Requested",
      ]);
    for (const [field, value] of entries) {
      const previous = before[field];
      const after =
        typeof previous === "number" &&
        typeof value === "string" &&
        /^[+-]\d+(\.\d+)?$/.test(value)
          ? previous + Number(value)
          : value;
      const whitespaceOnly =
        typeof previous === "string" &&
        typeof after === "string" &&
        previous !== after &&
        previous.replace(/\s+/g, " ").trim() ===
          after.replace(/\s+/g, " ").trim();
      total++;
      if (preview.rows.length < MAX_PREVIEW_ROWS)
        preview.rows.push([
          display(target),
          display(field),
          display(whitespaceOnly ? JSON.stringify(previous) : previous),
          display(whitespaceOnly ? JSON.stringify(after) : after),
        ]);
    }
  }
  preview.total = total;
  preview.note = data.id
    ? "Use your chat client's native approval controls, or confirm in chat when native controls are unavailable."
    : "Proposal only. Ask the assistant to create a change plan to capture and review the before values.";
  if (data.status && data.status !== "pending")
    preview.note = `Plan ${data.status}. This approval cannot apply further changes. Inspect the outcomes before making another plan.`;
  if (data.outcomes?.length)
    preview.note += ` Recorded outcomes: ${data.outcomes.length}. Inspect the plan result for individual failures.`;
  return preview;
}

function modelFor(raw: unknown): Preview | undefined {
  let data = object(raw);
  if (data.plan) data = object(data.plan);
  else if (data.result && typeof data.result === "object")
    data = object(data.result);
  if (Array.isArray(data.operations)) return planPreview(data);
  if (Array.isArray(data.findings)) {
    const preview = base(
      "Library health",
      "Review the evidence before asking for cleanup changes.",
    );
    preview.columns = ["Track / category", "Finding", "Details"];
    preview.rows = data.findings
      .slice(0, MAX_PREVIEW_ROWS)
      .map((row: any) => [
        display(row.trackId ?? row.tagId ?? row.categoryId),
        display(row.issue),
        display(row.fields ?? row.label ?? row),
      ]);
    preview.total = Number(data.total ?? data.findings.length);
    preview.facts = [
      ["Tracks inspected", display(data.scanned)],
      ["Findings", display(preview.total)],
    ];
    preview.note = display(
      data.consistency ??
        "Inspection only; no library changes have been applied.",
    );
    return preview;
  }
  if (Array.isArray(data.candidates)) {
    const preview = base(
      "Duplicate candidates",
      "These groups are evidence for review, not automatic deletion decisions.",
    );
    preview.columns = ["Track IDs", "Confidence", "Evidence"];
    preview.rows = data.candidates
      .slice(0, MAX_PREVIEW_ROWS)
      .map((row: any) => [
        display(row.trackIds),
        display(row.confidence),
        display(row.reason),
      ]);
    preview.total = Number(data.total ?? data.candidates.length);
    preview.facts = [
      ["Tracks indexed", display(data.scanned)],
      ["Groups", display(preview.total)],
    ];
    preview.note = data.truncated
      ? display(data.warning)
      : "No audio is analyzed by this preview and no tracks are deleted.";
    return preview;
  }
  if (Array.isArray(data.tracks)) {
    const preview = base(
      "Prepared set",
      "Review the order and match reasons before creating or updating a playlist.",
    );
    preview.columns = ["Order", "Track", "BPM / key", "Match reasons"];
    preview.rows = data.tracks
      .slice(0, MAX_PREVIEW_ROWS)
      .map((row: any, index: number) => [
        String(index + 1),
        display(`${row.artist ?? ""} — ${row.title ?? `ID ${row.id}`}`),
        `${display(row.bpm)} / ${display(row.key)}`,
        display(row.reasons ?? row.score),
      ]);
    preview.total = data.tracks.length;
    preview.facts = [
      ["Tracks", display(preview.total)],
      [
        "Duration",
        typeof data.durationSeconds === "number"
          ? `${Math.round(data.durationSeconds / 60)} min`
          : "—",
      ],
    ];
    preview.note = display(
      data.ordering ?? "This is a proposed set. No playlist has been changed.",
    );
    return preview;
  }
  if (Array.isArray(data.memberships)) {
    const preview = base(
      "Compare playlist membership",
      "Track IDs and the playlists that contain them.",
    );
    preview.columns = ["Track ID", "Playlist IDs"];
    preview.rows = data.memberships
      .slice(0, MAX_PREVIEW_ROWS)
      .map((row: any) => [display(row.trackId), display(row.playlistIds)]);
    preview.total = data.memberships.length;
    preview.facts = [
      ["Playlists", display(data.playlists?.length)],
      ["Shared tracks", display(data.commonTrackIds?.length)],
    ];
    preview.note = "Inspection only. Playlist membership is unchanged.";
    return preview;
  }
  if (data.state || data.status) {
    const preview = base(
      "Workflow status",
      "Job results become available after the inspection completes.",
    );
    preview.status = display(data.state ?? data.status);
    preview.columns = ["Property", "Value"];
    preview.rows = Object.entries(data)
      .filter(([key]) =>
        ["id", "name", "state", "progress", "error", "updatedAt"].includes(key),
      )
      .map(([key, value]) => [key, display(value)]);
    preview.total = preview.rows.length;
    preview.note = data.error
      ? display(data.error)
      : "Ask the assistant to retrieve the next result page when available.";
    return preview;
  }
  return undefined;
}

export function previewFor(raw: unknown): Preview | undefined {
  const preview = modelFor(raw);
  if (!preview) return undefined;
  while (
    Buffer.byteLength(JSON.stringify(preview), "utf8") > 80_000 &&
    preview.rows.length
  ) {
    preview.rows = preview.rows.slice(0, Math.floor(preview.rows.length * 0.8));
  }
  return preview;
}
