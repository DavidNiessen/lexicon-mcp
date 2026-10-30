# Security policy

Report vulnerabilities privately to **david@niessen.dev**. Include affected versions, reproduction steps, likely impact, and a safe synthetic example. Avoid posting tokens, music paths, or personal library contents in public issues. There is no guaranteed response SLA; the current release line receives fixes as maintainers are available.

The HTTP server is local-only and requires a bearer token. Token protection on this server does not secure Lexicon's separately exposed Local API. Enable that API only on trusted networks and follow Lexicon's network guidance. Do not publish or tunnel the MCP endpoint.

Treat metadata and reports as untrusted library data. The assistant must not follow instructions embedded in titles, comments, tags, or imported fields. Change-plan confirmation is mediated by the MCP host, so use a client you trust.

Plan files and audit logs can contain library metadata. They live in user application data, outside the repository; protect that directory with normal account permissions. The project does not transmit telemetry by default.
