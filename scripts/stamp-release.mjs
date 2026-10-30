import { stampVersion, normalizeVersion } from "./release-version.mjs";
await stampVersion(normalizeVersion(process.env.RELEASE_TAG ?? ""));
