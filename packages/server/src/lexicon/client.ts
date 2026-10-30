import { setTimeout as delay } from "node:timers/promises";
import type { HttpMethod } from "./operations.js";

export class LexiconError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly errorCode?: number,
    public readonly kind:
      | "disconnected"
      | "disabled"
      | "denied"
      | "unsupported"
      | "invalid"
      | "busy"
      | "upstream"
      | "ambiguous" = "upstream",
  ) {
    super(message);
    this.name = "LexiconError";
  }
}

export interface LexiconClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  readRetries?: number;
  fetch?: typeof globalThis.fetch;
}

function encodeQuery(input: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.some((item) => item !== null && typeof item === "object"))
        query.set(name, JSON.stringify(value));
      else for (const item of value) query.append(name, String(item));
    } else if (value !== null && typeof value === "object") {
      for (const [field, filter] of Object.entries(value))
        query.append(`${name}[${field}]`, String(filter));
    } else query.set(name, String(value));
  }
  return query;
}

export class LexiconClient {
  readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly readRetries: number;
  private readonly fetcher: typeof globalThis.fetch;
  private writeTail: Promise<unknown> = Promise.resolve();
  private activeReads = 0;
  private readonly waitingReads: Array<() => void> = [];
  constructor(options: LexiconClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:48624/v1").replace(
      /\/$/,
      "",
    );
    const url = new URL(this.baseUrl);
    if (
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        "Lexicon upstream must be an HTTP loopback URL without credentials, query, or fragment",
      );
    }
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.readRetries = options.readRetries ?? 2;
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  request<T = Record<string, unknown>>(
    method: HttpMethod,
    path: string,
    input: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<T> {
    if (
      !path.startsWith("/") ||
      path.includes("..") ||
      path.includes("?") ||
      path.includes("#")
    )
      return Promise.reject(new Error("Invalid API path"));
    const run = () => this.execute<T>(method, path, input, signal);
    if (method === "GET") return this.read(run);
    const result = this.writeTail.then(run, run);
    this.writeTail = result.catch(() => undefined);
    return result;
  }

  private async read<T>(run: () => Promise<T>): Promise<T> {
    if (this.activeReads >= 4) {
      await new Promise<void>((resolve) => this.waitingReads.push(resolve));
    } else this.activeReads++;
    try {
      return await run();
    } finally {
      const next = this.waitingReads.shift();
      if (next) next();
      else this.activeReads--;
    }
  }

  private async execute<T>(
    method: HttpMethod,
    path: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    const reads = method === "GET";
    const attempts = reads ? this.readRetries + 1 : 3;
    for (let attempt = 0; attempt < attempts; attempt++) {
      signal?.throwIfAborted();
      const query = reads ? encodeQuery(input).toString() : "";
      const timeout = AbortSignal.timeout(this.timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let response: Response;
      try {
        response = await this.fetcher(
          `${this.baseUrl}${path}${query ? `?${query}` : ""}`,
          {
            method,
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            ...(reads ? {} : { body: JSON.stringify(input) }),
            signal: combined,
            redirect: "error",
          },
        );
      } catch {
        if (signal?.aborted) throw signal.reason;
        if (reads && attempt + 1 < attempts) {
          await delay(100 * 2 ** attempt, undefined, { signal });
          continue;
        }
        throw new LexiconError(
          reads
            ? "Cannot reach Lexicon. Ensure Lexicon is running and its Local API is enabled under Settings > Integrations."
            : "Write outcome is unknown after a connection failure. Re-read the affected objects before retrying.",
          undefined,
          undefined,
          reads ? "disconnected" : "ambiguous",
        );
      }
      let payload: unknown;
      try {
        const text = await response.text();
        payload = text ? JSON.parse(text) : undefined;
      } catch {
        throw new LexiconError(
          reads
            ? "Lexicon returned malformed JSON"
            : "Write outcome is unknown because Lexicon returned malformed JSON",
          response.status,
          undefined,
          reads ? "upstream" : "ambiguous",
        );
      }
      const body =
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : {};
      if (!response.ok || typeof body.errorCode === "number") {
        const code =
          typeof body.errorCode === "number" ? body.errorCode : undefined;
        if (
          (code === 2 || (reads && response.status >= 500)) &&
          attempt + 1 < attempts
        ) {
          await delay(100 * 2 ** attempt, undefined, { signal });
          continue;
        }
        const kind =
          code === 2
            ? "busy"
            : code === 4 || response.status === 404
              ? "unsupported"
              : code === 6 || response.status === 401 || response.status === 403
                ? "denied"
                : code === 5
                  ? "invalid"
                  : "upstream";
        throw new LexiconError(
          typeof body.message === "string"
            ? body.message
            : `Lexicon returned HTTP ${response.status}`,
          response.status,
          code,
          kind,
        );
      }
      if (payload === undefined && !reads) return { status: "dispatched" } as T;
      if (
        !("data" in body) ||
        body.data === null ||
        typeof body.data !== "object" ||
        Array.isArray(body.data)
      )
        throw new LexiconError(
          "Lexicon returned an unexpected response envelope",
          response.status,
          undefined,
          reads ? "upstream" : "ambiguous",
        );
      return body.data as T;
    }
    throw new LexiconError("Retry limit exceeded");
  }

  async health(): Promise<{ status: "connected"; totalTracks: number | null }> {
    const result = await this.request("GET", "/tracks", {
      limit: 1,
      fields: ["id"],
    });
    return {
      status: "connected",
      totalTracks: typeof result.total === "number" ? result.total : null,
    };
  }
}
