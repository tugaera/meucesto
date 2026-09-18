import { describe, expect, it } from "vitest";
import { parseChangelog, renderAppVersion } from "../../scripts/versioning";

const valid = `# Changelog

## [1.2.0] - 2026-09-16

### Added
- A useful feature.

## [1.1.0] - 2026-09-15

### Fixed
- A useful fix.
`;

describe("changelog versioning", () => {
  it("parses ordered semantic releases", () => {
    const parsed = parseChangelog(valid.replace("# Changelog", "# Changelog\n\n## [Unreleased]\n"));
    expect(parsed.hasUnreleased).toBe(true);
    expect(parsed.releases.map((release) => release.version)).toEqual(["1.2.0", "1.1.0"]);
    const current = parsed.releases[0];
    expect(current).toBeDefined();
    if (!current) throw new Error("Expected a current release");
    expect(renderAppVersion(current)).toContain("APP_VERSION = '1.2.0'");
  });

  it("rejects duplicate, unordered, and unsupported sections", () => {
    expect(() => parseChangelog(valid.replace("## [1.1.0]", "## [1.2.0]"))).toThrow();
    expect(() => parseChangelog(valid.replace("### Fixed", "### Surprise"))).toThrow("Unsupported changelog category");
    expect(() => parseChangelog(valid.replace("## [1.2.0] - 2026-09-16", "## [1.2] - today"))).toThrow("Malformed release heading");
  });
});
