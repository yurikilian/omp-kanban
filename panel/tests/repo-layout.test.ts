import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Filenames common enough that every sub-project in this repository
 * legitimately ships its own copy (panel/, dashboard/, and the repository
 * root). A same-named file at another level is not evidence of a leaked
 * panel source file, so these are exempt from the duplicate-path check.
 */
const AMBIENT_BASENAMES: Record<string, true> = {
  "package.json": true,
  "package-lock.json": true,
  ".gitignore": true,
};

interface LayoutViolation {
  file: string;
  conflictsWith: string;
}

/**
 * Every panel-tracked file must resolve under panel/, and none of them may
 * have a same-relative-path sibling under dashboard/ or the repository root
 * - the two places a leaked panel source file would land. Ambient filenames
 * every sub-project legitimately owns a copy of are exempt.
 */
export function findLayoutViolations(
  panelFiles: string[],
  repoRoot: string,
  exists: (p: string) => boolean = fs.existsSync,
): LayoutViolation[] {
  const violations: LayoutViolation[] = [];

  for (const file of panelFiles) {
    if (!file.startsWith("panel/")) {
      violations.push({ file, conflictsWith: "does not resolve under panel/" });
      continue;
    }

    const relative = file.slice("panel/".length);
    if (AMBIENT_BASENAMES[path.basename(relative)]) continue;

    const underDashboard = path.join(repoRoot, "dashboard", relative);
    if (exists(underDashboard)) {
      violations.push({ file, conflictsWith: underDashboard });
      continue;
    }

    const atRepoRoot = path.join(repoRoot, relative);
    if (exists(atRepoRoot)) {
      violations.push({ file, conflictsWith: atRepoRoot });
    }
  }

  return violations;
}

const panelDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(panelDir, "..");

function trackedPanelFiles(): string[] {
  return execSync("git ls-files -- panel", { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

describe("panel implementation files resolve under panel/", () => {
  it("flags a file that resolves outside panel/", () => {
    const violations = findLayoutViolations(["dashboard/leaked.tsx"], repoRoot, () => false);
    expect(violations).toEqual([
      { file: "dashboard/leaked.tsx", conflictsWith: "does not resolve under panel/" },
    ]);
  });

  it("flags a panel file with a same-path sibling under dashboard/ or the repository root", () => {
    const exists = (p: string) => p.endsWith(path.join("dashboard", "src", "app", "page.tsx"));
    const violations = findLayoutViolations(["panel/src/app/page.tsx"], repoRoot, exists);
    expect(violations).toEqual([
      {
        file: "panel/src/app/page.tsx",
        conflictsWith: path.join(repoRoot, "dashboard", "src", "app", "page.tsx"),
      },
    ]);
  });

  it("does not flag an ambient filename every sub-project owns its own copy of", () => {
    const violations = findLayoutViolations(["panel/package.json"], repoRoot, () => true);
    expect(violations).toEqual([]);
  });

  it("the real repository tree has no layout violations after this cycle", () => {
    const files = trackedPanelFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(findLayoutViolations(files, repoRoot)).toEqual([]);
  });
});
