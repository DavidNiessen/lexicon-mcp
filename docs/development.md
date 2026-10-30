# Development and releases

## Local development

Use Node.js 24 and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm package
```

The bundled program is `packages/server/dist/cli.cjs`. Packaging produces `release/VERSION/lexicon-mcp-VERSION.tgz`, a constant-name `lexicon-mcp.tgz` alias, `INSTALL.md`, `SHA256SUMS`, a CycloneDX SBOM, and dependency notices. Intermediate files live in `work/package`. Both output directories are excluded from Git.

Packaging smoke-tests the actual tarball through npm exec (the implementation used by npx). It checks version/help and a Cursor project dry run in isolated storage. A separate asynchronous HTTP-server check runs npx using the documented direct tarball URL form and confirms that the installer actually executes. Both checks verify that dry runs create no agent configuration or runtime files. The user's real agent settings and Lexicon library are never installation test targets.

## Git and review

Use Conventional Commits and push each completed, tested step. Keep handwritten source and test files below 400 lines. New behavior needs focused tests and matching documentation.

## CI

Verification runs on Linux, Windows, and macOS with Node.js 24. Checks cover formatting, lint, types, architecture/file sizes, dependency licenses, credential patterns, relevant Conventional Commits, tests, bundle builds, and dependency advisories. One Ubuntu job creates the platform-neutral package; it contains no operating-system runtime or native executable. Actions are pinned and tracked by Dependabot.

## Versions and publishing

Every successful push build on `main` publishes a GitHub prerelease after verification and package smoke checks. Pull requests, feature branches, and failed builds publish no releases. Main builds are not cancelled by newer pushes; publication is serialized.

Run **Release** from `main` to choose `prerelease` or `release`. The optional `tag` accepts a version or v-prefixed tag. A blank version derives its stable baseline from Conventional Commits: breaking commits bump major, `feat` bumps minor, and other commits bump patch. Before the first stable tag, the checked-in server version is the baseline. `node scripts/next-version.mjs` prints that recommendation.

Prereleases append `-dev.RUN_ID.ATTEMPT`, giving each build and retry a unique version. Explicit prerelease versions such as `v0.2.0-rc.1` are used exactly. Stable releases require a version without a prerelease suffix and become GitHub's latest release. Manual versions take precedence. Existing releases are not overwritten; use a new version to recover from an already-created publication.

Preparation resolves one version and source SHA. The package job checks out that SHA, stamps workspace/server and CLI/MCP versions, validates, tests, builds, and packages it. Stamping changes only the build checkout. To reproduce a release, set `RELEASE_TAG` and run `node scripts/stamp-release.mjs` before building.

After packaging succeeds, the publisher creates a tag targeting the original source commit, stages assets in a draft, then publishes the selected channel after uploads succeed. The release notes and `INSTALL.md` contain the exact working npx tarball URL. Failed uploads leave a draft for inspection rather than exposing incomplete published assets.

After publication, `scripts/update-readme-install.mjs` updates only the matching README install block: `install:release` for a stable release, or `install:prerelease` for a prerelease. Keep both marker pairs unique and put only their managed command inside each block. Before the first stable publication, the stable block contains its unavailable note. Headings, prose, screenshots, other URLs, and the other channel remain untouched. Missing, duplicate, reversed, overlapping, or unexpectedly edited blocks fail validation before any write.

The updater verifies the published channel and uploaded package, then reads the latest README on `main` through GitHub's Contents API. It uses the file SHA and bounded conflict retries to preserve intervening edits, skips unchanged commands, and prevents older release reruns from moving a channel backward. The `[skip ci]` Conventional Commit uses `GITHUB_TOKEN`, so it does not trigger another prerelease build. Its write is limited to `README.md`; it never resets or force-pushes the branch.

Both public and private repositories are supported according to GitHub visibility. The publishing job needs `contents: write`; downloading build artifacts needs `actions: read`. npm registry publishing is disabled and no npm account is required for GitHub tarball installation.

## Dependency inventory

Artifacts contain dependency notices and a CycloneDX inventory covering build and runtime components. Node.js is required on the user's machine and is not redistributed in the package. The dependency inventory is intentionally broader than the bundled program's runtime graph.
