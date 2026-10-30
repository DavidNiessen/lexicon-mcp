import { createServer as createHttpServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createServer } from "./mcp.js";
import type { Runtime } from "./runtime.js";

export function authorized(
  request: { headers: Record<string, string | string[] | undefined> },
  token: string,
  port: number,
) {
  const host = request.headers.host,
    origin = request.headers.origin;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(String(host)))
    return 403;
  if (
    origin &&
    ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(
      String(origin),
    )
  )
    return 403;
  const supplied = Buffer.from(String(request.headers.authorization ?? "")),
    expected = Buffer.from(`Bearer ${token}`);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return 401;
  return 200;
}
export async function serveHttp(runtime: Runtime, port: number) {
  const token = runtime.config.httpToken;
  if (!token)
    throw new Error(
      "Run config init or set LEXICON_HTTP_TOKEN before using HTTP",
    );
  const handler = createMcpHandler(() => createServer(runtime));
  const nodeHandler = toNodeHandler(handler);
  const server = createHttpServer(async (req, res) => {
    const status = authorized(req, token, port);
    if (status !== 200) {
      res.writeHead(status);
      res.end();
      return;
    }
    if (req.url !== "/mcp") {
      res.writeHead(404);
      res.end();
      return;
    }
    await nodeHandler(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}
