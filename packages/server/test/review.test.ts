import { expect, it } from "vitest";
import {
  CLIENT_CAPABILITIES_META_KEY,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { reviewCapabilities } from "../src/review.js";

it("detects rendering and advertised forms for diagnostics without treating URL elicitation as form controls", () => {
  const ctx = { mcpReq: {} } as ServerContext;
  expect(reviewCapabilities(ctx, { elicitation: {} })).toEqual({
    inline: false,
    form: true,
  });
  expect(reviewCapabilities(ctx, { elicitation: { form: {} } }).form).toBe(
    true,
  );
  expect(reviewCapabilities(ctx, { elicitation: { url: {} } }).form).toBe(
    false,
  );
  expect(
    reviewCapabilities(ctx, {
      extensions: {
        "io.modelcontextprotocol/ui": {
          mimeTypes: ["text/html;profile=mcp-app"],
        },
      },
    }).inline,
  ).toBe(true);
  expect(
    reviewCapabilities(ctx, {
      extensions: {
        "io.modelcontextprotocol/ui": { mimeTypes: ["text/plain"] },
      },
    }).inline,
  ).toBe(false);
});

it("uses modern per-request capabilities over the legacy initialize capabilities", () => {
  const modern = {
    mcpReq: { envelope: { [CLIENT_CAPABILITIES_META_KEY]: {} } },
  } as ServerContext;
  expect(
    reviewCapabilities(modern, {
      elicitation: {},
      experimental: { "io.modelcontextprotocol/ui": {} },
    }),
  ).toEqual({ inline: false, form: false });
});
