import { describe, expect, it } from "vitest";
import { assessAuditEligibility } from "./eligibility";

describe("assessAuditEligibility", () => {
  it("marks an unreadable transcript ineligible with an actionable reason (E4-S1-AC6)", () => {
    expect(assessAuditEligibility(null)).toEqual({
      eligible: false,
      reason: "The session transcript could not be read.",
    });
  });

  it("marks a blank transcript ineligible before audit generation (E4-S1-AC6)", () => {
    expect(assessAuditEligibility(" \n\t ")).toEqual({
      eligible: false,
      reason: "The session transcript is empty.",
    });
  });

  it("leaves a readable transcript eligible for audit generation (E4-S1-AC6)", () => {
    expect(assessAuditEligibility('{"type":"session"}')).toEqual({ eligible: true });
  });
});