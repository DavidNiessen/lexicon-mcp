export interface LibraryClient {
  request(
    method: string,
    path: string,
    input?: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface Track {
  id: number;
  [field: string]: unknown;
}

export interface WorkflowContext {
  signal?: AbortSignal;
  progress?: (completed: number, total?: number) => void;
}

export interface ProposedOperation {
  tool: string;
  input: Record<string, unknown>;
}

export function dataOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object")
    throw new Error("Invalid Lexicon response");
  const response = value as Record<string, unknown>;
  return response.data && typeof response.data === "object"
    ? (response.data as Record<string, unknown>)
    : response;
}

export function abortIfNeeded(context: WorkflowContext): void {
  context.signal?.throwIfAborted();
}

export function normalizeText(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/g, " ")
    : "";
}

export function normalizedIdentity(value: unknown): string {
  return normalizeText(value).toLocaleLowerCase("en");
}

export async function* trackPages(
  client: LibraryClient,
  input: Record<string, unknown>,
  context: WorkflowContext = {},
): AsyncGenerator<Track[]> {
  let offset = 0;
  while (true) {
    abortIfNeeded(context);
    const data = dataOf(
      await client.request("GET", "/tracks", {
        source: "non-archived",
        ...input,
        limit: 500,
        offset,
      }),
    );
    if (!Array.isArray(data.tracks))
      throw new Error("Lexicon response has no tracks array");
    const tracks = data.tracks as Track[];
    yield tracks;
    offset += tracks.length;
    const total = typeof data.total === "number" ? data.total : undefined;
    context.progress?.(offset, total);
    if (tracks.length === 0 || (total !== undefined && offset >= total)) return;
  }
}

export function numberOf(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}
