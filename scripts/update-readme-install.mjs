import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  currentInstall,
  installTarget,
  replaceInstall,
} from "./readme-install.mjs";

export function githubRequest(method, endpoint, body) {
  try {
    const output = execFileSync(
      "gh",
      [
        "api",
        "--method",
        method,
        endpoint,
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        "X-GitHub-Api-Version: 2022-11-28",
        ...(body ? ["--input", "-"] : []),
      ],
      {
        encoding: "utf8",
        input: body ? JSON.stringify(body) : undefined,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    return JSON.parse(output);
  } catch (cause) {
    const status = Number(
      String(cause.stderr ?? "").match(/HTTP (\d{3})/)?.[1],
    );
    throw Object.assign(
      new Error(`GitHub request failed (${status || "unknown"}).`),
      {
        status,
      },
    );
  }
}

function publishedRelease(value, target) {
  if (
    value?.tag_name !== target.tag ||
    value.draft !== false ||
    value.prerelease !== (target.type === "prerelease") ||
    !Number.isFinite(Date.parse(value.published_at)) ||
    !value.assets?.some(
      (asset) =>
        asset.name === target.artifact &&
        asset.state === "uploaded" &&
        asset.size > 0,
    )
  )
    throw new Error(
      "README command requires the published channel and uploaded package.",
    );
  return value;
}

export async function updateReadmeInstall(options, request = githubRequest) {
  const target = installTarget(options);
  const base = `repos/${target.repository}`;
  const releasePath = (tag) =>
    `${base}/releases/tags/${encodeURIComponent(tag)}`;
  const release = publishedRelease(
    await request("GET", releasePath(target.tag)),
    target,
  );
  const filePath = `${base}/contents/README.md`;
  for (let attempt = 0; attempt < 3; attempt++) {
    // Read current main, not the release source checkout: preserve intervening edits.
    const file = await request("GET", `${filePath}?ref=main`);
    if (
      file?.type !== "file" ||
      file.path !== "README.md" ||
      file.encoding !== "base64" ||
      !/^[a-f0-9]{40}$/.test(file.sha ?? "")
    )
      throw new Error(
        "Expected the current README file and content SHA on main.",
      );
    const bytes = Buffer.from(file.content, "base64");
    const source = bytes.toString("utf8");
    if (!Buffer.from(source, "utf8").equals(bytes))
      throw new Error("README must be lossless UTF-8; no content was written.");
    const next = replaceInstall(source, target);
    if (next === source) return { status: "unchanged", tag: target.tag };
    const current = currentInstall(source, target.type);
    if (
      current?.repository === target.repository &&
      current.tag !== target.tag
    ) {
      let prior;
      try {
        prior = await request("GET", releasePath(current.tag));
      } catch (error) {
        if (error.status !== 404) throw error;
      }
      if (
        prior?.draft === false &&
        prior.prerelease === release.prerelease &&
        Date.parse(prior.published_at) >= Date.parse(release.published_at)
      )
        return { status: "newer-command-preserved", tag: current.tag };
    }
    try {
      await request("PUT", filePath, {
        message: `docs(readme): update ${target.type} install command [skip ci]`,
        content: Buffer.from(next, "utf8").toString("base64"),
        sha: file.sha,
        branch: "main",
      });
      return { status: "updated", tag: target.tag };
    } catch (error) {
      if (error.status !== 409 || attempt === 2) throw error;
    }
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  if (process.env.GITHUB_REF !== "refs/heads/main")
    throw new Error("Update README release commands from main only.");
  const outcome = await updateReadmeInstall({
    repository: process.env.GH_REPO,
    tag: process.env.RELEASE_TAG,
    type: process.env.RELEASE_TYPE,
  });
  console.log(`README install command: ${outcome.status} (${outcome.tag}).`);
}
