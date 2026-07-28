import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BundleValidation } from "@/server/audits/validate";
import { InvalidBundleNotice } from "./invalid-bundle-notice";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createInvalidBundle(): string {
  const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-invalid-audit-"));
  temporaryDirectories.push(bundleDir);
  fs.writeFileSync(path.join(bundleDir, "manifest.json"), '{"schemaVersion":1}');
  fs.writeFileSync(path.join(bundleDir, "audit.json"), "not trusted");
  fs.writeFileSync(path.join(bundleDir, "report.md"), "# Not trusted");
  fs.writeFileSync(path.join(bundleDir, "evidence.jsonl"), "{bad json");
  return bundleDir;
}

const INVALID_MANIFEST: BundleValidation = {
  status: "invalid",
  issues: [{ file: "manifest.json", location: "target.sessionId", message: "Required" }],
  manifest: null,
};

describe("InvalidBundleNotice", () => {
  it("states that a rerun is unavailable without a valid target and never rewrites the inspection artifacts (E4-S5-AC5)", () => {
    const bundleDir = createInvalidBundle();
    const artifactContents = ["manifest.json", "audit.json", "report.md", "evidence.jsonl"].map((filename) =>
      fs.readFileSync(path.join(bundleDir, filename), "utf8"),
    );

    render(<InvalidBundleNotice bundleDir={bundleDir} validation={INVALID_MANIFEST} />);

    expect(screen.getByText("A rerun is unavailable because the audit target could not be verified.")).toBeInTheDocument();
    expect(screen.getByText(`${bundleDir}/manifest.json`)).toBeInTheDocument();
    expect(screen.getByText(`${bundleDir}/audit.json`)).toBeInTheDocument();
    expect(screen.getByText(`${bundleDir}/report.md`)).toBeInTheDocument();
    expect(screen.getByText(`${bundleDir}/evidence.jsonl`)).toBeInTheDocument();
    expect(["manifest.json", "audit.json", "report.md", "evidence.jsonl"].map((filename) => fs.readFileSync(path.join(bundleDir, filename), "utf8"))).toEqual(
      artifactContents,
    );
  });
});