import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuditTotals } from "./audit-totals";

describe("AuditTotals (E4-S8-AC2, E4-S8-AC4)", () => {
  it("renders the totals stated by audit.json instead of calculating a total from findings (E4-S8-AC4)", () => {
    render(<AuditTotals totals={{ inputTokens: 210000, outputTokens: 18500, cost: 4.62, currency: "USD" }} />);

    const totals = screen.getByRole("region", { name: "Audit totals" });
    expect(within(totals).getByText("210,000 input tokens")).toBeVisible();
    expect(within(totals).getByText("18,500 output tokens")).toBeVisible();
    expect(within(totals).getByText("$4.62")).toBeVisible();
  });

  it("renders a null stated cost as pricing unavailable rather than zero (E4-S8-AC2)", () => {
    render(<AuditTotals totals={{ inputTokens: 210000, outputTokens: 18500, cost: null, currency: null }} />);

    const totals = screen.getByRole("region", { name: "Audit totals" });
    expect(within(totals).getByText("Pricing unavailable")).toBeVisible();
    expect(within(totals).queryByText("$0.00")).not.toBeInTheDocument();
  });
});
