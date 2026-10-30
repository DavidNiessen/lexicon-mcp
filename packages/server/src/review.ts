import {
  CLIENT_CAPABILITIES_META_KEY,
  type ServerContext,
} from "@modelcontextprotocol/server";

/** Rendering capabilities are diagnostic only; they never send an approval question. */
export function reviewCapabilities(
  ctx: ServerContext,
  legacyCapabilities?: unknown,
) {
  const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
  const capabilities = (envelope?.[CLIENT_CAPABILITIES_META_KEY] ??
    legacyCapabilities ??
    {}) as Record<string, any>;
  const ui =
    capabilities.extensions?.["io.modelcontextprotocol/ui"] ??
    capabilities.experimental?.["io.modelcontextprotocol/ui"];
  const inline = Boolean(
    ui &&
    typeof ui === "object" &&
    (ui.mimeTypes === undefined ||
      (Array.isArray(ui.mimeTypes) &&
        ui.mimeTypes.includes("text/html;profile=mcp-app"))),
  );
  const elicitation = capabilities.elicitation;
  const form = Boolean(
    elicitation &&
    typeof elicitation === "object" &&
    (Object.keys(elicitation).length === 0 ||
      (elicitation.form && typeof elicitation.form === "object")),
  );
  return { inline, form };
}
