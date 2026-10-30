# Development and releases

## Local loop

Use Node.js 24 and the pnpm version pinned in the workspace. Install with `pnpm install --frozen-lockfile`. Run `pnpm check`, `pnpm test`, and `pnpm build`. `node scripts/check-companion.mjs` executes read-only report actions with synthetic sandbox globals.

The source bundle is `packages/server/dist/cli.cjs`. `pnpm package` creates artifacts under `release/VERSION-PLATFORM-ARCH`. Intermediate files live in `work/package`. Both directories are excluded from Git.

Use a disposable Lexicon library and a separate `LEXICON_DATA_DIR` for live write tests. Tests in CI must run without Lexicon, using synthetic HTTP fixtures and local clients. `node scripts/live-smoke.mjs` is the explicit read-only live probe.

## Git and review

Use milestone branches and Conventional Commits. Each completed, tested step is committed and pushed immediately. Milestone PRs are merged only after CI passes, preserving their individual commits. Enable required checks and protect `main` where the private account's feature set supports that setting; otherwise maintainers enforce the same gate before merging.

CI checks formatting, lint, types, tests, architecture/file size, companion scripts, common secret patterns, the package build, and high-severity production dependency advisories. A separate job builds each desktop artifact and launches it. Actions are pinned to verified commit SHAs and updated through Dependabot.

CodeQL is an optional manual workflow because private-repository availability depends on GitHub account features. Configure private vulnerability reporting, secret scanning, and dependency alerts when the repository plan permits them. Local credential-pattern checks remain available without those services.

## Version and private release

Run **Private candidate release** from `main`. The optional `tag` field accepts a version or a `v`-prefixed tag, including prereleases such as `v0.2.0-rc.1`. Leave it blank for automatic selection. Run `node scripts/next-version.mjs` locally for the same read-only recommendation.

Automatic selection uses the highest reachable stable `vMAJOR.MINOR.PATCH` tag. Breaking commits (`!` or a `BREAKING CHANGE` footer) bump major; `feat` bumps minor; other commits bump patch. With no stable release tag, the checked-in server version is used for the first release. No unreleased commits stops automatic releases. A manual version takes precedence. An existing manual tag is reused only when its source package passes release validation; use this to retry a failed build before a draft was created.

1. For a new tag, preparation synchronizes workspace, server, companion, CLI, and MCP versions, then runs checks, tests, and a build.
2. It commits any version changes as `chore(release): prepare vVERSION` and atomically pushes that commit to `main` with the annotated tag. A concurrent change to `main` rejects the push rather than overwriting work. The Actions token needs write permission to repository contents; repository rules must permit this release commit.
3. All platform jobs consume the same resolved tag, validate its source version and private visibility, then build Windows x64/macOS arm64/macOS x64 artifacts. Runs are serialized to prevent concurrent version selection.
4. Only successful platform builds lead to a **private draft prerelease**, with checksums and commit-derived notes. Review verification evidence before publishing the draft within the private repository. If a later platform build fails, the version commit/tag remain available for an explicit retry using that tag.

The workflow does not publish npm packages, convert repository visibility, or submit to public registries. Public distribution requires a deliberate later workflow change and explicit approval.

Artifacts contain the exact bundled Node runtime license, dependency notices, and a CycloneDX build/runtime component inventory. The inventory includes build dependencies and is intentionally broader than the executable's runtime graph. Executable archives carry their own SBOM/notices; the draft uploader attaches deduplicated Node/plugin packages and platform archives.

macOS is ad-hoc signed and Windows is unsigned by default. Trusted code signing and macOS notarization require separate maintainer credentials and a hardened credential-backed job; these are not prerequisites for private candidate packaging and are not represented as complete.
