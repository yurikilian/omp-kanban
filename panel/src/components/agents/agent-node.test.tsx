import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "@/app/globals.css";
import { AgentNode } from "./agent-node";

const READY_STATUS = { label: "Completed", basis: "a normal session exit event", derived: true as const };

describe("AgentNode", () => {
  it("renders the agent's name, monogram, role, hierarchical path and textual status, nested under its spawner (E3-S8-AC1)", () => {
    render(
      <AgentNode
        name="Worker"
        path={["main", "Worker"]}
        parentUnknown={false}
        status={READY_STATUS}
        durationMs={270_000}
        inputTokens={800}
        outputTokens={150}
        costUsd={0.008}
      />,
    );

    const node = screen.getByTestId("agent-node");

    // Name.
    expect(screen.getByText("Worker")).toBeInTheDocument();

    // Monogram - a single letter derived from the name, decorative.
    const monogram = node.querySelector('[data-slot="agent-monogram"]');
    expect(monogram).not.toBeNull();
    expect(monogram).toHaveTextContent("W");
    expect(monogram).toHaveAttribute("aria-hidden", "true");

    // Role - the labelled agent badge (E2-S1-AC3), never just a bare color.
    const badge = node.querySelector(".agent-badge");
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent(/./); // carries a visible text label

    // Hierarchical path.
    expect(node.querySelector('[data-slot="agent-path"]')).toHaveTextContent("main / Worker");

    // Textual status.
    expect(node.querySelector('[data-slot="agent-status"]')).toHaveTextContent("Completed");
  });

  it("uses the first alphanumeric character for a punctuation-prefixed agent monogram (E3-S8-AC1)", () => {
    render(
      <AgentNode name="__advisor" path={["__advisor"]} parentUnknown={true} status={READY_STATUS} durationMs={null} inputTokens={null} outputTokens={null} costUsd={null} />,
    );

    expect(screen.getByTestId("agent-node").querySelector('[data-slot="agent-monogram"]')).toHaveTextContent("A");
  });

  it("gives the session's root agent the coordinator role", () => {
    render(
      <AgentNode name="main" path={["main"]} parentUnknown={false} status={READY_STATUS} durationMs={null} inputTokens={null} outputTokens={null} costUsd={null} />,
    );

    const badge = screen.getByTestId("agent-node").querySelector(".agent-badge");
    expect(badge).toHaveAttribute("data-agent-family", "coordinator");
    expect(badge).toHaveTextContent("Coordinator");
  });

  it("uses a documented agent-family name as the textual role when the transcript records one (E3-S8-AC1)", () => {
    render(
      <AgentNode name="Planner" path={["main", "Planner"]} parentUnknown={false} status={READY_STATUS} durationMs={null} inputTokens={null} outputTokens={null} costUsd={null} />,
    );

    const badge = screen.getByTestId("agent-node").querySelector(".agent-badge");
    expect(badge).toHaveAttribute("data-agent-family", "planner");
    expect(badge).toHaveTextContent("Planner");
  });

  it("shows every agent metric the transcript never recorded as unavailable rather than zero (E3-S8-AC2)", () => {
    render(
      <AgentNode
        name="Scout"
        path={["main", "Scout"]}
        parentUnknown={false}
        status={READY_STATUS}
        durationMs={null}
        inputTokens={null}
        outputTokens={null}
        costUsd={null}
      />,
    );

    const node = screen.getByTestId("agent-node");
    expect(node.querySelector('[data-metric="duration"]')).toHaveTextContent("Unavailable");
    expect(node.querySelector('[data-metric="input-tokens"]')).toHaveTextContent("Unavailable");
    expect(node.querySelector('[data-metric="output-tokens"]')).toHaveTextContent("Unavailable");
    expect(node.querySelector('[data-metric="cost"]')).toHaveTextContent("Unavailable");
    expect(node.querySelector('[data-metric="cost"]')).not.toHaveTextContent("$0.00");
  });

  it("formats each metric the transcript did record instead of leaving it unavailable (E3-S8-AC2)", () => {
    render(
      <AgentNode
        name="Scout"
        path={["main", "Scout"]}
        parentUnknown={false}
        status={READY_STATUS}
        durationMs={4.5 * 60 * 1000}
        inputTokens={1500}
        outputTokens={300}
        costUsd={0.008}
      />,
    );

    const node = screen.getByTestId("agent-node");
    expect(node.querySelector('[data-metric="duration"]')).toHaveTextContent("4m 30s");
    expect(node.querySelector('[data-metric="input-tokens"]')).toHaveTextContent("1.5K");
    expect(node.querySelector('[data-metric="output-tokens"]')).toHaveTextContent("300");
    expect(node.querySelector('[data-metric="cost"]')).toHaveTextContent("$0.01");
  });

  it("marks an agent with no recorded parent as unknown-parent instead of implying an attached one (E3-S8-AC6)", () => {
    render(
      <AgentNode
        name="Orphan"
        path={["Orphan"]}
        parentUnknown={true}
        status={READY_STATUS}
        durationMs={null}
        inputTokens={null}
        outputTokens={null}
        costUsd={null}
      />,
    );

    expect(screen.getByText(/unknown parent/i)).toBeInTheDocument();
  });

  it("does not mark an agent whose parent is recorded as unknown-parent", () => {
    render(
      <AgentNode
        name="Worker"
        path={["main", "Worker"]}
        parentUnknown={false}
        status={READY_STATUS}
        durationMs={null}
        inputTokens={null}
        outputTokens={null}
        costUsd={null}
      />,
    );

    expect(screen.queryByText(/unknown parent/i)).toBeNull();
  });
});