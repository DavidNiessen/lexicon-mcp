import { join } from "node:path";
import { z } from "zod";
import {
  LexiconClient,
  operations,
  listCommands,
  getCommand,
} from "./lexicon/index.js";
import {
  WorkflowService,
  workflowRegistry,
  JobManager,
  ExportService,
} from "./workflows/index.js";
import { ChangePlans, type Operation } from "./changes.js";
import { Store } from "./storage.js";
import type { Config } from "./config.js";
import { preserveImportedData } from "./lexicon/preservation.js";

export class Runtime {
  readonly client: LexiconClient;
  readonly store: Store;
  readonly plans: ChangePlans;
  readonly workflows: WorkflowService;
  readonly jobs: JobManager;
  constructor(readonly config: Config) {
    this.client = new LexiconClient({ baseUrl: config.baseUrl });
    this.store = new Store(join(config.dataDir, "changes"));
    this.plans = new ChangePlans(
      this.store,
      {
        execute: (op) => this.execute(op),
        snapshot: (op) => this.snapshot(op),
        prepare: (op) => this.prepare(op),
      },
      config.readOnly,
    );
    this.workflows = new WorkflowService(this.client);
    this.jobs = new JobManager(join(config.dataDir, "jobs"));
  }
  async initialize() {
    await this.store.initialize();
    await this.jobs.initialize();
  }
  operation(name: string) {
    const op = operations.find((o) => o.name === name);
    if (!op) throw new Error(`Unknown operation ${name}`);
    return op;
  }
  async prepare(raw: Operation): Promise<Operation> {
    const op = this.operation(raw.tool);
    if (!op.mutating)
      throw new Error("Change plans only accept mutation tools");
    const input = op.inputSchema.parse(raw.input) as Record<string, any>;
    if (input.id === "selected") {
      const selected: any = await this.client.request(
        "GET",
        "/tracks/selected",
      );
      const ids = selected.ids ?? selected.trackIds ?? selected;
      if (!Array.isArray(ids) || ids.length !== 1)
        throw new Error(
          "Resolve selected tracks to explicit IDs and create one operation per track",
        );
      input.id = ids[0];
    }
    if (op.path === "/control") {
      const command = getCommand(input.action);
      if (!command) throw new Error("Unknown command");
      if ((command as any).classification === "unsupported")
        throw new Error("Command is documented as unsupported");
      // Control actions operate on live UI state. Captured preconditions are checked immediately before dispatch.
    }
    return {
      tool: op.name,
      input:
        op.path === "/track"
          ? await preserveImportedData(this.client, input)
          : input,
    };
  }
  async expandSelections(operations: Operation[]): Promise<Operation[]> {
    const result: Operation[] = [];
    let ids: number[] | undefined;
    for (const operation of operations) {
      if (operation.input.id !== "selected") {
        result.push(operation);
        continue;
      }
      this.operation(operation.tool).inputSchema.parse(operation.input);
      if (!ids) {
        const selected = await this.client.request("GET", "/tracks/selected");
        ids = z.array(z.number().int().positive()).min(1).parse(selected.ids);
      }
      result.push(
        ...ids.map((id) => ({
          tool: operation.tool,
          input: { ...operation.input, id },
        })),
      );
    }
    return result;
  }
  async execute(raw: Operation) {
    if (this.config.readOnly)
      throw new Error("Read-only mode prohibits mutations");
    const op = this.operation(raw.tool);
    const input = op.inputSchema.parse(raw.input) as Record<string, unknown>;
    const result = await this.client.request(op.method, op.path, input);
    return op.path === "/control"
      ? { ...result, status: "dispatched", completionObservable: false }
      : result;
  }
  async snapshot(raw: Operation): Promise<unknown> {
    const { path } = this.operation(raw.tool),
      input = raw.input;
    if (path === "/control") {
      const action = String(input.action),
        parameters = input.parameters ?? {};
      const state: Record<string, unknown> = {};
      if (action === "AudioAnalyzer_Analyze") {
        state.tracks = await Promise.all(
          parameters.trackIds.map((id: number) =>
            this.client.request("GET", "/track", { id }),
          ),
        );
      } else {
        if (
          /Selected|TrackBrowser_|Application_Set|Application_Tags|ApplyCuepointGenerator|FavoritePlaylists_Add/.test(
            action,
          )
        ) {
          const selected = await this.client.request("GET", "/tracks/selected");
          const ids = selected.ids as number[];
          state.selectedIds = ids;
          state.tracks = await Promise.all(
            ids.map((id) => this.client.request("GET", "/track", { id })),
          );
        }
        if (
          action.startsWith("Playlists_") ||
          action.startsWith("FavoritePlaylists_")
        ) {
          const selected = await this.client.request(
            "GET",
            "/playlists/selected",
          );
          state.selectedPlaylistIds = selected.ids;
          state.playlists = await Promise.all(
            (selected.ids as number[]).map((id) =>
              this.client.request("GET", "/playlist", { id }),
            ),
          );
        }
        if (
          action.startsWith("MusicPlayer_") ||
          action.startsWith("Direct2Cdj_")
        ) {
          const playing = await this.client.request("GET", "/playing");
          state.playingTrack = playing.track;
        }
      }
      return state;
    }
    if (path === "/track" || path === "/track/location")
      return this.client.request("GET", "/track", { id: input.id });
    if (path === "/tracks" && input.ids)
      return Promise.all(
        input.ids.map((id: number) =>
          this.client.request("GET", "/track", { id }),
        ),
      );
    if (path.startsWith("/playlist")) {
      if (input.id)
        return this.client.request("GET", "/playlist", { id: input.id });
      if (input.ids)
        return Promise.all(
          input.ids.map((id: number) =>
            this.client.request("GET", "/playlist", { id }),
          ),
        );
      return this.client.request("GET", "/playlists");
    }
    if (path.startsWith("/tag")) return this.client.request("GET", "/tags");
    if (path === "/tracks") return { locations: input.locations };
    throw new Error("No safe precondition reader for this operation");
  }
  requiresPlan(op: Operation) {
    const def = this.operation(op.tool);
    if (
      def.method === "DELETE" ||
      def.path === "/track/location" ||
      op.input.id === "selected"
    )
      return true;
    if (Object.values(op.input).some((v) => Array.isArray(v) && v.length > 1))
      return true;
    if (def.path === "/control") {
      const command = getCommand(String(op.input.action));
      if (!command || command.classification === "unsupported") return true;
      return command.risk !== "low";
    }
    return false;
  }
  async call(name: string, input: Record<string, any>): Promise<unknown> {
    if (name === "lexicon_list_commands") return listCommands(input.query);
    if (name === "lexicon_get_command") {
      const command = getCommand(input.name);
      if (!command) throw new Error("Unknown command");
      const { inputSchema, ...metadata } = command;
      return { ...metadata, parameterSchema: z.toJSONSchema(inputSchema) };
    }
    if (name === "lexicon_plan_changes")
      return this.plans.create(await this.expandSelections(input.operations));
    if (name === "lexicon_get_change_plan") return this.plans.get(input.id);
    if (name === "lexicon_apply_change_plan")
      return this.plans.apply(input.id, input.hash);
    if (name === "lexicon_cancel_change_plan")
      return this.plans.cancel(input.id);
    if (name === "lexicon_start_job")
      return this.jobs.start(
        input.workflow,
        input.input ?? {},
        (context: any) =>
          this.workflows.run(input.workflow, input.input ?? {}, context),
      );
    if (name === "lexicon_job_status") return this.jobs.status(input.id);
    if (name === "lexicon_job_results")
      return this.jobs.results(input.id, input.offset, input.limit);
    if (name === "lexicon_cancel_job") return this.jobs.cancel(input.id);
    if (name === "lexicon_export_report") {
      if (!this.config.exportDir)
        throw new Error("Configure exportDir before exporting reports");
      const result = await this.jobs.exportResults(input.id);
      return new ExportService(this.config.exportDir).write(
        input.format,
        input.outputPath,
        result,
      );
    }
    if (workflowRegistry.some((w) => w.name === name))
      return this.workflows.run(name, input);
    const def = this.operation(name),
      parsed = def.inputSchema.parse(input) as Record<string, any>;
    if (!def.mutating) return this.client.request(def.method, def.path, parsed);
    const op = { tool: name, input: parsed };
    if (this.requiresPlan(op))
      return {
        reviewRequired: true,
        plan: await this.plans.create(await this.expandSelections([op])),
        instruction:
          "Show the preview and obtain user confirmation before calling lexicon_apply_change_plan with this plan ID and hash.",
      };
    return this.store.exclusive(async () => {
      const result = await this.execute(await this.prepare(op));
      await this.store.audit({ tool: name, status: "completed" });
      return result;
    });
  }
}
const id = z.string().uuid();
export const managementTools = [
  {
    name: "lexicon_list_commands",
    description: "Search documented commands and their prerequisites.",
    inputSchema: z.object({ query: z.string().optional() }),
  },
  {
    name: "lexicon_get_command",
    description:
      "Inspect command parameters, effects and completion limitations.",
    inputSchema: z.object({ name: z.string() }),
  },
  {
    name: "lexicon_plan_changes",
    description:
      "Preview explicit mutations without writing to Lexicon. Present the plan to the user for review.",
    inputSchema: z.object({
      operations: z
        .array(
          z.object({
            tool: z.string(),
            input: z.record(z.string(), z.unknown()),
          }),
        )
        .min(1)
        .max(1000),
    }),
  },
  {
    name: "lexicon_get_change_plan",
    description: "Read an existing preview and per-operation outcomes.",
    inputSchema: z.object({ id }),
  },
  {
    name: "lexicon_apply_change_plan",
    description:
      "Apply a reviewed plan only after user confirmation. Client mediates approval.",
    inputSchema: z.object({ id, hash: z.string().length(64) }),
  },
  {
    name: "lexicon_cancel_change_plan",
    description: "Cancel a pending plan.",
    inputSchema: z.object({ id }),
  },
  {
    name: "lexicon_start_job",
    description: "Start a cancellable library workflow.",
    inputSchema: z.object({
      workflow: z.string(),
      input: z.record(z.string(), z.unknown()).optional(),
    }),
  },
  {
    name: "lexicon_job_status",
    description: "Inspect job progress.",
    inputSchema: z.object({ id: z.string() }),
  },
  {
    name: "lexicon_job_results",
    description: "Read a page of workflow results.",
    inputSchema: z.object({
      id: z.string(),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(1000).default(100),
    }),
  },
  {
    name: "lexicon_cancel_job",
    description: "Cancel a running job at the next safe boundary.",
    inputSchema: z.object({ id: z.string() }),
  },
  {
    name: "lexicon_export_report",
    description: "Explicitly export a job result under configured exportDir.",
    inputSchema: z.object({
      id: z.string(),
      format: z.enum(["json", "csv"]),
      outputPath: z.string(),
    }),
  },
];
