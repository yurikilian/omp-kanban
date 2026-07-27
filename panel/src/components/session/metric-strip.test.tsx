import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../app/globals.css";
import { MetricStrip } from "./metric-strip";

describe("MetricStrip", () => {
  it("renders cost, tokens, agent count and tool calls as one inline strip instead of KPI cards (E3-S6-AC1)", () => {
    render(
      <MetricStrip
        costUsd={12.5}
        inputTokens={1500}
        outputTokens={300}
        agentCount={3}
        toolCallCount={7}
      />,
    );

    const metrics = screen.getByRole("region", { name: "Session metrics" });
    const values = metrics.querySelectorAll("dd");
    expect(values).toHaveLength(5);
    expect(values[0]).toHaveTextContent("$12.50 cost");
    expect(values[1]).toHaveTextContent("1.5K input");
    expect(values[2]).toHaveTextContent("300 output");
    expect(values[3]).toHaveTextContent("3 agents");
    expect(values[4]).toHaveTextContent("7 tool calls");

    const strip = metrics.querySelector("dl");
    if (!strip) throw new Error("Session metrics needs a definition-list strip");
    const stripStyle = getComputedStyle(strip);
    expect(stripStyle.display).toBe("flex");
    expect(stripStyle.flexDirection).toBe("row");
    expect(stripStyle.flexWrap).toBe("nowrap");

    const items = metrics.querySelectorAll("[data-session-metric]");
    expect(items).toHaveLength(5);
    for (const item of items) {
      const itemStyle = getComputedStyle(item);
      expect(itemStyle.display).toBe("inline-flex");
      expect(itemStyle.borderTopWidth).toBe("0px");
      expect(itemStyle.paddingLeft).toBe("0px");
      expect(itemStyle.backgroundColor).toMatch(/transparent|rgba\(0, 0, 0, 0\)/);
    }
  });

  it("keeps unavailable usage metrics distinct from known zero counts (E3-S6-AC1)", () => {
    render(
      <MetricStrip costUsd={null} inputTokens={null} outputTokens={null} agentCount={1} toolCallCount={0} />,
    );

    const metrics = screen.getByRole("region", { name: "Session metrics" });
    expect(within(metrics).getAllByText(/Unavailable/)).toHaveLength(3);
    const values = metrics.querySelectorAll("dd");
    expect(values[3]).toHaveTextContent("1 agent");
    expect(values[4]).toHaveTextContent("0 tool calls");
  });
});
