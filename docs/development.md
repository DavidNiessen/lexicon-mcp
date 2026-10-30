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

Use Semantic Versioning: `fix` increments patch, `feat` increments minor, and breaking changes increment major. Run `node scripts/next-version.mjs` for a read-only recommendation derived from Conventional Commits since the last stable tag. Maintain a release PR updating the server, companion, and workspace versions with release notes describing user-visible behavior and evidence. Draft release notes are generated from the Conventional Commit history.

1. Merge the tested release PR and tag its commit `vVERSION`.
2. Run **Private candidate release** with that existing tag.
3. The workflow verifies the tag matches the server package and the repository is private, then repeats checks and builds Windows x64/macOS arm64/macOS x64 artifacts.
4. The workflow collects outputs and creates a **private draft prerelease**, with checksums. Review verification evidence before publishing the draft within the private repository.

The workflow does not publish npm packages, convert repository visibility, or submit to public registries. Public distribution requires a deliberate later workflow change and explicit approval.

Artifacts contain the exact bundled Node runtime license, dependency notices, and a CycloneDX build/runtime component inventory. The inventory includes build dependencies and is intentionally broader than the executable's runtime graph. Executable archives carry their own SBOM/notices; the draft uploader attaches deduplicated Node/plugin packages and platform archives.

macOS is ad-hoc signed and Windows is unsigned by default. Trusted code signing and macOS notarization require separate maintainer credentials and a hardened credential-backed job; these are not prerequisites for private candidate packaging and are not represented as complete.
