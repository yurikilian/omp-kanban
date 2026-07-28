import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Finding } from "@/server/audits/bundle-schema";
import { FindingCard } from "./finding-card";
import { ProvenanceLabel } from "./provenance-label";

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
  evidenceIds: ["evidence-1"],
  causalChain: [],
  limitations: [],
  proposalIds: [],
};

describe("FindingCard provenance (E4-S8-AC2, E4-S8-AC3)", () => {
  it("states that a null cost is pricing unavailable, never zero or an invented amount (E4-S8-AC2)", () => {
    render(<FindingCard finding={FINDING} />);

    const card = screen.getByRole("article");
    expect(within(card).getAllByText(/Pricing unavailable/)).toHaveLength(2);
    expect(within(card).queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("shows the observed and estimated provenance labels without hover, with an estimate distinct from a measurement (E4-S8-AC3)", () => {
    render(<FindingCard finding={FINDING} />);

    const card = screen.getByRole("article");
    expect(within(card).getByText("Observed")).toBeVisible();
    expect(within(card).getByText("Estimated")).toBeVisible();
  });

  it("keeps all provenance categories visible without hover (E4-S8-AC3)", () => {
    render(
      <div>
        <ProvenanceLabel provenance="observed" />
        <ProvenanceLabel provenance="derived" />
        <ProvenanceLabel provenance="estimated" />
        <ProvenanceLabel provenance="inferred" />
        <ProvenanceLabel provenance="unavailable" />
      </div>,
    );

    expect(screen.getByText("Observed")).toBeVisible();
    expect(screen.getByText("Derived")).toBeVisible();
    expect(screen.getByText("Estimated")).toBeVisible();
    expect(screen.getByText("Inferred")).toBeVisible();
    expect(screen.getByText("Unavailable")).toBeVisible();
  });

  it("renders a cost-only estimate instead of labelling its known value unavailable (E4-S8-AC2, E4-S8-AC3)", () => {
    render(
      <FindingCard
        finding={{
          ...FINDING,
          estimatedSavings: { cost: { minimum: 0.76, likely: 1.22, maximum: 1.52 } },
        }}
      />,
    );

    const card = screen.getByRole("article");
    expect(within(card).getByText("$1.22")).toBeVisible();
    expect(within(card).queryByText("Pricing unavailable")).not.toBeInTheDocument();
  });
});
