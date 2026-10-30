import { randomBytes } from "node:crypto";
import {
  CLIENT_CAPABILITIES_META_KEY,
  createRequestStateCodec,
  inputRequired,
  inputResponse,
  acceptedContent,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { digest, type Plan } from "./changes.js";
import { previewFor } from "./ui/model.js";

interface ReviewRuntime {
  plans: { get(id: string): Promise<Plan> };
  approvals: {
    issue(
      id: string,
      hash: string,
    ): Promise<{ id: string; hash: string; token: string }>;
  };
  confirmFromUi(input: {
    id: string;
    hash: string;
    token: string;
    decision: "apply" | "cancel";
  }): Promise<Plan>;
}
const stateSchema = z
  .object({
    purpose: z.literal("lexicon-native-review"),
    tool: z.string(),
    argsHash: z.string().length(64),
    id: z.string().uuid(),
    hash: z.string().length(64),
  })
  .strict();
type ReviewState = z.infer<typeof stateSchema>;
const confirmationSchema = z.object({ approve: z.boolean() }).strict();
const REVIEW_KEY = "lexicon_ui_approval";
const controllers = new WeakMap<object, ReturnType<typeof buildController>>();

/** Resolve capabilities from the request envelope, or the legacy initialize handshake. */
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

export function nativeReviewMessage(plan: Plan) {
  const preview = previewFor(plan);
  const rows = preview?.rows ?? [];
  const lines = [
    `Review ${plan.operations.length} library operation(s).`,
    `Plan: ${plan.id}`,
    `Preview hash: ${plan.hash}`,
    "",
    "Target | Field | Before | After",
  ];
  let count = 0;
  for (const row of rows) {
    const line = row.join(" | ");
    if (lines.join("\n").length + line.length > 10_000) break;
    lines.push(line);
    count++;
  }
  if ((preview?.total ?? 0) > count)
    lines.push(
      `Showing ${count} of ${preview?.total} changed fields; the approval covers all ${plan.operations.length} operations in this exact plan.`,
    );
  lines.push(
    "",
    "Check Apply these changes and submit this dialog to approve. Submit it unchecked to cancel this plan. Closing or declining the dialog leaves the plan pending. A message in chat does not approve this plan.",
  );
  return lines.join("\n");
}

function buildController(runtime: ReviewRuntime) {
  const codec = createRequestStateCodec<ReviewState>({
    key: randomBytes(32),
    ttlSeconds: 600,
    bind: (ctx) =>
      `${ctx.mcpReq.method}\0${ctx.http?.authInfo?.clientId ?? "local"}`,
  });
  return {
    /** Install as McpServer's requestState.verify option. Reused for the whole Runtime. */
    verifyState: codec.verify,
    async resume(tool: string, input: unknown, ctx: ServerContext) {
      const raw = ctx.mcpReq.requestState();
      if (raw === undefined) return undefined;
      const state = stateSchema.parse(raw);
      if (state.tool !== tool || state.argsHash !== digest(input))
        throw new Error(
          "UI review continuation does not match this tool call.",
        );
      const plan = await runtime.plans.get(state.id);
      if (plan.hash !== state.hash)
        throw new Error("UI review refers to a different plan hash.");
      if (plan.status === "completed" || plan.status === "cancelled")
        return { kind: "resolved" as const, plan };
      if (plan.status !== "pending")
        throw new Error(
          "This plan requires reconciliation before another UI review.",
        );
      const response = inputResponse(ctx.mcpReq.inputResponses, REVIEW_KEY);
      if (response.kind !== "elicit")
        throw new Error(
          "UI confirmation was not completed; no changes were applied.",
        );
      if (response.action !== "accept")
        return { kind: "dismissed" as const, plan };
      const content = acceptedContent(
        ctx.mcpReq.inputResponses,
        REVIEW_KEY,
        confirmationSchema,
      );
      if (response.action === "accept" && !content)
        throw new Error("Invalid UI confirmation; no changes were applied.");
      if (content?.approve !== true)
        return { kind: "dismissed" as const, plan };
      const grant = await runtime.approvals.issue(plan.id, plan.hash);
      return {
        kind: "resolved" as const,
        plan: await runtime.confirmFromUi({ ...grant, decision: "apply" }),
      };
    },
    async request(
      plan: Plan,
      tool: string,
      input: unknown,
      ctx: ServerContext,
      capabilities: { inline: boolean; form: boolean },
    ) {
      if (capabilities.inline) return { kind: "inline" as const };
      if (!capabilities.form)
        return {
          kind: "unavailable" as const,
          uiUnavailable: true,
          message:
            "This MCP client did not advertise an inline MCP Apps preview or a native MCP confirmation dialog. Changes remain blocked. Reconnect with UI support; chat confirmation cannot apply the plan.",
        };
      if (plan.status !== "pending") return { kind: "resolved" as const, plan };
      const requestState = await codec.mint(
        {
          purpose: "lexicon-native-review",
          tool,
          argsHash: digest(input),
          id: plan.id,
          hash: plan.hash,
        },
        ctx,
      );
      return {
        kind: "input-required" as const,
        response: inputRequired({
          requestState,
          inputRequests: {
            [REVIEW_KEY]: inputRequired.elicit({
              mode: "form",
              message: nativeReviewMessage(plan),
              requestedSchema: {
                type: "object",
                properties: {
                  approve: {
                    type: "boolean",
                    title: "Apply these changes",
                    description: "Approve all operations in the reviewed plan.",
                    default: false,
                  },
                },
                required: ["approve"],
              },
            }),
          },
        }),
      };
    },
  };
}

/** HTTP creates a fresh McpServer per request, so state signing must outlive that instance. */
export function createNativeReview(runtime: ReviewRuntime) {
  let controller = controllers.get(runtime);
  if (!controller) {
    controller = buildController(runtime);
    controllers.set(runtime, controller);
  }
  return controller;
}
