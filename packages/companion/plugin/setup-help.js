_helpers.Report("Lexicon MCP runs as a separate local program.");
_helpers.Report("1. Enable Local API in Lexicon Settings > Integrations.");
_helpers.Report(
  "2. Download the matching executable from your private repository release.",
);
_helpers.Report("3. Run lexicon-mcp doctor to check API access.");
_helpers.Report(
  "4. Configure your MCP client to launch lexicon-mcp serve --transport stdio.",
);
_helpers.Report(
  "5. Ask the assistant to inspect your library before making changes.",
);
_helpers.Report(
  "Bulk or destructive edits require a preview and your confirmation in chat.",
);
_helpers.Report(
  "This companion only reports context. The MCP server works without it.",
);
_helpers.Report("Documentation: https://github.com/DavidNiessen/lexicon-mcp");
