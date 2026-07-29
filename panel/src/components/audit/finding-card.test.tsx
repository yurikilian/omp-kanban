import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Finding } from "@/server/audits/bundle-schema";
import { FindingCard } from "./finding-card";

const FINDING: Finding = {
  id: "finding-1",
  category: "repeated_context_loading",
  title: "Repeated repository context loading",
  severity: "high",
  confidence: "high",
  summary: "Agents loaded the same repository context repeatedly.",
  observedImpact: { inputTokens: 94000, outputTokens: 0, cost: null },
  estimatedSavings: {
    inputTokens: { minimum: 38000, likely: 61000, maximum: 76000 },
    cost: null,
  },
  evidenceIds: ["evidence-1", "evidence-2"],
  causalChain: [],
  limitations: [],
  proposalIds: [],
};

describe("FindingCard evidence (E4-S9-AC1, E4-S9-AC2)", () => {
  it("renders one EvidenceLink per cited evidence id, scoped to the finding's audit", () => {
    render(<FindingCard auditId="audit-42" finding={FINDING} />);

    const card = screen.getByRole("article");
    const firstLink = within(card).getByRole("link", { name: "Open evidence evidence-1" });
    expect(firstLink).toHaveAttribute("href", "/api/audits/audit-42/evidence?evidenceId=evidence-1");

    const secondLink = within(card).getByRole("link", { name: "Open evidence evidence-2" });
    expect(secondLink).toHaveAttribute("href", "/api/audits/audit-42/evidence?evidenceId=evidence-2");
  });

  it("renders no evidence link for a finding that cites none", () => {
    render(<FindingCard auditId="audit-42" finding={{ ...FINDING, evidenceIds: [] }} />);

    const card = screen.getByRole("article");
    expect(within(card).queryAllByRole("link")).toHaveLength(0);
  });

  it("renders no evidence link when the card is not scoped to an audit", () => {
    render(<FindingCard finding={FINDING} />);

    const card = screen.getByRole("article");
    expect(within(card).queryAllByRole("link")).toHaveLength(0);
  });
});
