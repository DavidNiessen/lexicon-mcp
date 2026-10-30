# Development and releases

## Local loop

Use Node.js 24 and the pnpm version pinned in the workspace. Install with `pnpm install --frozen-lockfile`. Run `pnpm check`, `pnpm test`, and `pnpm build`. `node scripts/check-companion.mjs` executes read-only report actions with synthetic sandbox globals.

The source bundle is `packages/server/dist/cli.cjs`. `pnpm package` creates artifacts under `release/VERSION-PLATFORM-ARCH`. Intermediate files live in `work/package`. Both directories are excluded from Git.

Use a disposable Lexicon library and a separate `LEXICON_DATA_DIR` for live write tests. Tests in CI must run without Lexicon, using synthetic HTTP fixtures and local clients. `node scripts/live-smoke.mjs` is the explicit read-only live probe.

## Git and review

Use milestone branches and Conventional Commits. Each completed, tested step is committed and pushed immediately. Milestone PRs are merged only after CI passes, preserving their individual commits. Enable required checks and protect `main` where the private account's feature set supports that setting; otherwise maintainers enforce the same gate before merging.

CI checks formatting, lint, types, tests, architecture/file size, companion scripts, common secret patterns, the package build, and high-severity production dependency advisories. A separate job builds each desktop artifact and launches it. Actions are pinned to verified commit SHAs and updated through Dependabot.

CodeQL is an optional manual workflow because private-repository availability depends on GitHub account features. Configure private vulnerability reporting, secret scanning, and dependency alerts when the repository plan permits them. Local credential-pattern checks remain available without those services.

## Versions and publishing

Every successful push build on `main` publishes a GitHub prerelease after verification and all three desktop package builds pass. Pull requests, feature branches, and failed builds publish no releases. Default builds are not cancelled by newer pushes; publication runs are serialized.

Run **Release** manually from `main` to choose `prerelease` (default) or `release`. The optional `tag` field accepts a version or v-prefixed tag. Leave it blank to derive the next stable version from Conventional Commits: breaking commits bump major, `feat` bumps minor, and other commits bump patch. The checked-in server version is the initial baseline when no stable tag exists. `node scripts/next-version.mjs` prints this stable baseline recommendation locally.

Prereleases append `-dev.RUN_ID.ATTEMPT` to that baseline, so each build and retry has a unique version. An explicit prerelease such as `v0.2.0-rc.1` is used exactly. Stable releases require a version without a prerelease suffix and become GitHub's latest release; prereleases never replace latest. Manual versions take precedence. Existing published tags/releases are not overwritten; retry with a new version if a prior publication already exists.

Preparation resolves one version and source SHA. Every platform checks out that exact SHA, stamps the same version into the workspace/server/companion manifests and CLI/MCP version module, validates, tests, builds, and packages it. Version stamping changes only build workspaces; the workflow never pushes version commits to `main`. Reproducing a release from its source tag requires running `scripts/stamp-release.mjs` with `RELEASE_TAG` set to the release tag before building.

Only after all platform builds pass does the publisher create the tag targeting the original source commit. It uploads assets to a temporary draft, then publishes it as the selected channel once uploads succeed. A failure can leave a draft for inspection but cannot expose partially uploaded assets as a completed release. Actions needs `contents: write` for this publishing job. Both public and private repositories are supported; GitHub repository visibility determines who can download their releases. npm registry publication remains disabled.

Artifacts contain the exact bundled Node runtime license, dependency notices, and a CycloneDX build/runtime component inventory. The inventory includes build dependencies and is intentionally broader than the executable's runtime graph. Executable archives carry their own SBOM/notices; the draft uploader attaches deduplicated Node/plugin packages and platform archives.

macOS is ad-hoc signed and Windows is unsigned by default. Trusted code signing and macOS notarization require separate maintainer credentials and a hardened credential-backed job; these are not prerequisites for candidate packaging and are not represented as complete.
