# Contributing

Use Node.js 24 and the pinned pnpm version. Run `pnpm install --frozen-lockfile`, then `pnpm check`, `pnpm test`, and `pnpm build`. All tests must use synthetic data or a disposable library; never commit personal library exports or audio.

Create a focused branch, add meaningful tests for behavior changes, and update the relevant guide. Use Conventional Commits such as `feat(playlists): support membership comparison` or `fix(api): preserve upstream error codes`. Push each completed, locally checked implementation step. Open a milestone PR and preserve individual commits when merging after CI passes.

Keep handwritten source and test files below 400 lines. Respect the domain/application/infrastructure boundary described in [architecture](docs/architecture.md). New operations must appear in the capability inventory and receive validation, error handling, and a risk classification. Do not introduce undocumented upstream APIs or mutation retries after ambiguous outcomes.

Report bugs with the executable/package version, operating system, Lexicon version, redacted `doctor` output, expected behavior, and a synthetic reproduction. Support contact: david@niessen.dev or Discord `david.niessen`.
