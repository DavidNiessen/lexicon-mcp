import { readFile } from "node:fs/promises";
import { chooseVersion, releaseHistory } from "./release-version.mjs";
const { version: current } = JSON.parse(
  await readFile("packages/server/package.json", "utf8"),
);
console.log(
  JSON.stringify(
    chooseVersion({
      current,
      ...releaseHistory(),
      manual: process.env.RELEASE_TAG ?? "",
    }),
    null,
    2,
  ),
);
