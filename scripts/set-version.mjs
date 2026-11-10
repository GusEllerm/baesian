// Run by `npm version <x.y.z> --no-git-tag-version` (package.json's `version` script), after npm sets package.json's
// version: writes the same version into src/version.ts, which the schema, the service and the client read without
// Node's filesystem. test/plugin.test.ts fails if the two differ.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const path = join(root, "src", "version.ts");
const text = readFileSync(path, "utf8");
const line = /^export const VERSION = "[^"]*";$/m;
if (!line.test(text)) {
  console.error(`${path} has no line \`export const VERSION = "…";\` to set`);
  process.exit(1);
}
writeFileSync(path, text.replace(line, `export const VERSION = ${JSON.stringify(version)};`));
console.log(`src/version.ts: ${version}`);
