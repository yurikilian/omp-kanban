// @vitest-environment node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateAuditBundle } from "./validate";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(dirname, "../../../tests/fixtures/audits");
const bundlePath = (name: string) => path.join(fixturesDir, name);

describe("a conforming bundle validates and becomes readable for its session (E4-S5-AC1)", () => {
  it("a conforming fixture bundle validates and becomes readable for its session", () => {
    const result = validateAuditBundle(bundlePath("bundle-valid"));

    expect(result.status).toBe("valid");
    if (result.status !== "valid") throw new Error("unreachable");
    expect(result.manifest.target.sessionId).toBe("2026-07-22T10-15-00-aaaa1111");
    expect(result.manifest.status).toBe("completed");
    expect(result.audit.findings).toHaveLength(1);
    expect(result.audit.findings[0].title).toBe("Full log file read instead of tailed");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].id).toBe("evidence-1");
    expect(result.reportMarkdown).toContain("Full log file read instead of tailed");
  });
});

describe("a malformed bundle records an invalid-output state naming the offending field or line (E4-S5-AC2)", () => {
  it("a missing required field records an invalid-output state naming that field", () => {
    const result = validateAuditBundle(bundlePath("bundle-missing-field"));

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") throw new Error("unreachable");
    expect(result.issues).toContainEqual(expect.objectContaining({ file: "audit.json", location: "methodology" }));
    // The manifest itself was fine, so the invalid audit still resolves to
    // its session rather than becoming unattached.
    expect(result.manifest?.target.sessionId).toBe("2026-07-22T11-00-00-bbbb2222");
  });

  it("a field of the wrong type and an unparseable evidence line each name the offending field or line", () => {
    const wrongType = validateAuditBundle(bundlePath("bundle-wrong-type"));
    expect(wrongType.status).toBe("invalid");
    if (wrongType.status !== "invalid") throw new Error("unreachable");
    expect(wrongType.issues).toContainEqual(
      expect.objectContaining({ file: "audit.json", location: "sessionTotals.inputTokens" }),
    );

    const badEvidence = validateAuditBundle(bundlePath("bundle-bad-evidence-line"));
    expect(badEvidence.status).toBe("invalid");
    if (badEvidence.status !== "invalid") throw new Error("unreachable");
    expect(badEvidence.issues).toContainEqual(
      expect.objectContaining({ file: "evidence.jsonl", location: "line 2" }),
    );
  });
});

describe("an unsupported schema version is reported, not parsed optimistically (E4-S5-AC3)", () => {
  it("an unsupported schema version is reported rather than parsed optimistically", () => {
    const result = validateAuditBundle(bundlePath("bundle-unsupported-version"));

    expect(result.status).toBe("unsupported_schema_version");
    if (result.status !== "unsupported_schema_version") throw new Error("unreachable");
    // A number, read straight off the manifest - not coerced or guessed.
    expect(result.schemaVersion).toBe(2);
  });
});

describe("a bundle still being written is never presented as complete (E4-S5-AC4)", () => {
  it("a bundle still being written is not presented as a complete audit", () => {
    const result = validateAuditBundle(bundlePath("bundle-incomplete"));

    expect(result.status).toBe("incomplete");
    if (result.status !== "incomplete") throw new Error("unreachable");
    // audit.json itself is well-formed and carries a real finding, but
    // report.md and evidence.jsonl never finished writing - the whole
    // bundle must read as incomplete, and the "incomplete" branch carries
    // no `audit` field at all, so there is nothing here that could leak
    // that finding out as final even by mistake.
    expect(result.missingFiles.slice().sort()).toEqual(["evidence.jsonl", "report.md"]);
    expect("audit" in result).toBe(false);
  });
});
