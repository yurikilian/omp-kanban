// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { auditsForSession, indexAuditBundles, readCompletedAuditMetadata } from "./index-bundles";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(dirname, "../../../tests/fixtures/audits");

describe("indexing a bundle root (E4-S5-AC1, E4-S5-AC2, E4-S5-AC4)", () => {
  it("a conforming bundle is indexed and becomes readable for its session, alongside invalid, incomplete and unsupported-version bundles and a stray non-bundle file", () => {
    const index = indexAuditBundles(fixturesDir);

    // AC1: the conforming bundle validates and becomes readable for its session.
    const valid = auditsForSession(index, "2026-07-22T10-15-00-aaaa1111");
    expect(valid).toHaveLength(1);
    expect(valid[0].auditId).toBe("bundle-valid");
    expect(valid[0].validation.status).toBe("valid");

    // AC2: an invalid bundle is still recorded, resolved to its session
    // (its manifest was fine), but marked invalid rather than trustworthy.
    const invalidEntry = index.all.find((entry) => entry.auditId === "bundle-missing-field");
    expect(invalidEntry?.validation.status).toBe("invalid");
    expect(invalidEntry?.sessionId).toBe("2026-07-22T11-00-00-bbbb2222");
    const invalidForSession = auditsForSession(index, "2026-07-22T11-00-00-bbbb2222");
    expect(invalidForSession).toHaveLength(1);
    expect(invalidForSession[0].validation.status).toBe("invalid");

    // AC4: a bundle still being written is recorded as incomplete, not
    // attached to a session as if it were finished.
    const incompleteEntry = index.all.find((entry) => entry.auditId === "bundle-incomplete");
    expect(incompleteEntry?.validation.status).toBe("incomplete");
    expect(incompleteEntry?.sessionId).toBeNull();

    // AC3: an unsupported schema version is recorded as itself.
    const unsupportedEntry = index.all.find((entry) => entry.auditId === "bundle-unsupported-version");
    expect(unsupportedEntry?.validation.status).toBe("unsupported_schema_version");

    // A plain file living alongside the bundle directories is not itself a
    // bundle and must not stop the rest of the root from indexing.
    expect(index.all.some((entry) => entry.auditId === "not-a-bundle.txt")).toBe(false);
  });

  it("a root directory that does not exist yet indexes as empty rather than throwing", () => {
    const index = indexAuditBundles(path.join(fixturesDir, "does-not-exist-yet"));

    expect(index.all).toEqual([]);
    expect(index.bySessionId.size).toBe(0);
  });

  it("reads a completed audit's metadata without loading evidence records (E4-S9-AC4)", () => {
    const bundleDir = path.join(fixturesDir, "bundle-valid");
    const manifestPath = path.join(bundleDir, "manifest.json");
    const auditPath = path.join(bundleDir, "audit.json");
    const reportPath = path.join(bundleDir, "report.md");
    const evidencePath = path.join(bundleDir, "evidence.jsonl");
    const readFileSync = vi.spyOn(fs, "readFileSync");

    try {
      const audit = readCompletedAuditMetadata(fixturesDir, {
        auditId: "bundle-valid",
        sessionId: "2026-07-22T10-15-00-aaaa1111",
      });

      expect(audit?.auditId).toBe("bundle-valid");
      expect(readFileSync).toHaveBeenCalledTimes(2);
      expect(readFileSync).toHaveBeenCalledWith(manifestPath, "utf8");
      expect(readFileSync).toHaveBeenCalledWith(auditPath, "utf8");
      expect(readFileSync).not.toHaveBeenCalledWith(reportPath, "utf8");
      expect(readFileSync).not.toHaveBeenCalledWith(evidencePath, "utf8");
    } finally {
      readFileSync.mockRestore();
    }
  });
});
