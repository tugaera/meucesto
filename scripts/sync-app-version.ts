import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  readRootChangelog,
  renderAppVersion,
  renderStructuredChangelog,
} from "./versioning.ts";

const root = process.cwd();
const parsed = readRootChangelog(root);
const current = parsed.releases[0];
if (!current) {
  throw new Error("No released changelog version found");
}

const packagePath = resolve(root, "package.json");
const packageJson: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
if (!packageJson || typeof packageJson !== "object" || !("version" in packageJson)) {
  throw new Error("package.json is missing a version field");
}

const synchronizedPackage = { ...packageJson, version: current.version };
writeFileSync(packagePath, `${JSON.stringify(synchronizedPackage, null, 2)}\n`, "utf8");
writeFileSync(resolve(root, "src/generated/app-version.ts"), renderAppVersion(current), "utf8");
writeFileSync(
  resolve(root, "src/generated/changelog.ts"),
  renderStructuredChangelog(parsed.releases),
  "utf8",
);

process.stdout.write(`Synchronized Meu Cesto v${current.version} (${current.date}).\n`);
