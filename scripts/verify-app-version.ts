import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseChangelog,
  readRootChangelog,
  renderAppVersion,
  renderStructuredChangelog,
  type ChangelogRelease,
} from "./versioning.ts";

interface PackageShape {
  readonly version: string;
}

function readPackage(path: string): PackageShape {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || !("version" in parsed) || typeof parsed.version !== "string") {
    throw new Error("package.json must contain a string version");
  }
  return { version: parsed.version };
}

function assertFile(path: string, expected: string): void {
  const actual = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
  if (actual !== expected) {
    throw new Error(`${path} is stale. Run pnpm version:sync.`);
  }
}

function gitOutput(root: string, args: readonly string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function getBaseReleases(root: string, baseRef: string): readonly ChangelogRelease[] {
  try {
    const baseMarkdown = gitOutput(root, ["show", `${baseRef}:CHANGELOG.md`]);
    return parseChangelog(baseMarkdown).releases;
  } catch {
    return [];
  }
}

function verifyHistory(root: string, current: readonly ChangelogRelease[]): void {
  const baseRef = process.env.VERSION_BASE_REF?.trim() || "origin/main";
  const baseReleases = getBaseReleases(root, baseRef);
  for (const published of baseReleases) {
    const matching = current.find((release) => release.version === published.version);
    if (!matching || matching.raw !== published.raw) {
      throw new Error(`Published changelog release ${published.version} was modified or removed`);
    }
  }

  let changed = "";
  try {
    const committed = gitOutput(root, ["diff", "--name-only", `${baseRef}...HEAD`]);
    const working = gitOutput(root, ["status", "--short"]);
    changed = `${committed}\n${working}`.trim();
  } catch {
    return;
  }

  const baseLatest = baseReleases[0];
  const currentLatest = current[0];
  if (changed && baseLatest && currentLatest?.version === baseLatest.version) {
    throw new Error(`Repository changes require a new released changelog version above ${baseLatest.version}`);
  }
}

const root = process.cwd();
const parsed = readRootChangelog(root);
if (process.env.CI && parsed.hasUnreleased) {
  throw new Error("CI releases cannot contain a pending [Unreleased] section");
}

const current = parsed.releases[0];
if (!current) {
  throw new Error("No current release exists");
}

const packageJson = readPackage(resolve(root, "package.json"));
if (packageJson.version !== current.version) {
  throw new Error(`package.json version ${packageJson.version} does not match changelog ${current.version}`);
}

assertFile(resolve(root, "src/generated/app-version.ts"), renderAppVersion(current));
assertFile(resolve(root, "src/generated/changelog.ts"), renderStructuredChangelog(parsed.releases));
verifyHistory(root, parsed.releases);

const releaseTag = process.env.RELEASE_TAG?.trim();
if (releaseTag && releaseTag !== `v${current.version}`) {
  throw new Error(`Release tag ${releaseTag} does not match v${current.version}`);
}

process.stdout.write(`Verified Meu Cesto v${current.version}.\n`);
