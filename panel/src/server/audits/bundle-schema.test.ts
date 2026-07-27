// @vitest-environment node
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAuditReport } from "./bundle-schema";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(dirname, "../../../tests/fixtures/audits");
const readFixture = (name: string) => fs.readFileSync(path.join(fixturesDir, name), "utf8");
const readJsonFixture = (name: string): unknown => JSON.parse(readFixture(name));

describe("audit.json shape (E4-S4-AC3)", () => {
  it("a conforming audit.json carries coverage gaps, totals, breakdowns, findings and proposals in the documented shapes", () => {
    const audit = parseAuditReport(readJsonFixture("audit-valid-priced.json"));

    expect(audit.coverageGaps).toEqual([
      "cache read/write fields were absent in this session's transcript version, so cache efficiency is unmeasured",
    ]);
    expect(audit.sessionTotals).toEqual({
      inputTokens: 210000,
      outputTokens: 18500,
      cost: 4.62,
      currency: "USD",
    });
    expect(audit.findings).toHaveLength(2);
    expect(audit.proposals).toHaveLength(2);

    const [firstFinding] = audit.findings;
    expect(firstFinding.estimatedSavings.inputTokens).toEqual({ minimum: 38000, likely: 61000, maximum: 76000 });
    expect(firstFinding.evidenceIds).toEqual(["evidence-1", "evidence-2"]);
    expect(firstFinding.confidence).toBe("high");
    expect(firstFinding.severity).toBe("high");

    const [firstProposal] = audit.proposals;
    expect(firstProposal.type).toBe("hook");
    expect(firstProposal.wastePrevented).toEqual(["finding-1"]);
    expect(firstProposal.automaticApplicationAllowed).toBe(false);

    expect(typeof audit.methodology).toBe("string");
    expect(audit.methodology.length).toBeGreaterThan(0);
  });
});

describe("pricing-unavailable values are null, not a guess (E4-S4-AC3)", () => {
  it("a value whose pricing was unavailable is null rather than a guess", () => {
    const tokenOnly = parseAuditReport(readJsonFixture("audit-valid-token-only.json"));

    expect(tokenOnly.sessionTotals.cost).toBeNull();
    expect(tokenOnly.sessionTotals.currency).toBeNull();
    expect(tokenOnly.findings[0].observedImpact.cost).toBeNull();
    expect(tokenOnly.findings[0].estimatedSavings.cost).toBeNull();
    expect(tokenOnly.proposals[0].expectedSavings.cost).toBeNull();

    // sessionTotals.currency is null (no pricing source), so a non-null cost
    // anywhere in the document is a guess the schema refuses to accept.
    expect(() => parseAuditReport(readJsonFixture("audit-invalid-guessed-cost.json"))).toThrow();
  });
});
