import { cleanupMetadata } from "./cleanup.js";
import { findDuplicates } from "./duplicates.js";
import { libraryHealth } from "./health.js";
import { playlistWorkflow } from "./playlists.js";
import { workflowRegistry } from "./registry.js";
import { prepareSet } from "./sets.js";
import type { LibraryClient, WorkflowContext } from "./types.js";

export { workflowRegistry } from "./registry.js";
export { JobManager } from "./jobs.js";
export { ExportService } from "./reports.js";
export type {
  LibraryClient,
  ProposedOperation,
  WorkflowContext,
} from "./types.js";

export class WorkflowService {
  constructor(private readonly client: LibraryClient) {}

  async run(
    name: string,
    rawInput: unknown,
    context: WorkflowContext = {},
  ): Promise<unknown> {
    const definition = workflowRegistry.find((item) => item.name === name);
    if (!definition) throw new Error(`Unknown workflow: ${name}`);
    const input = definition.inputSchema.parse(rawInput) as Record<
      string,
      unknown
    >;
    switch (name) {
      case "lexicon_library_health":
        return libraryHealth(this.client, input, context);
      case "lexicon_find_duplicates":
        return findDuplicates(this.client, input, context);
      case "lexicon_cleanup_metadata":
        return cleanupMetadata(this.client, input, context);
      case "lexicon_playlist_workflow":
        return playlistWorkflow(this.client, input, context);
      case "lexicon_prepare_set":
        return prepareSet(this.client, input, context);
      default:
        throw new Error(`Unknown workflow: ${name}`);
    }
  }
}
