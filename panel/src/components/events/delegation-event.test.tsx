import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../app/globals.css";
import { DelegationEvent } from "./delegation-event";

describe("DelegationEvent", () => {
  it("shows the parent-to-child hand-off (E3-S7-AC1)", () => {
    const { container } = render(
      <DelegationEvent
        timestamp="2026-01-01T09:04:00.000Z"
        parentAgent="main"
        childAgent="Scout"
        task="Delegate research to Scout"
      />,
    );

    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("Scout")).toBeInTheDocument();
    // A directional marker between the two names is what makes this a
    // hand-off rather than two unrelated labels.
    expect(container.querySelector('[data-slot="event-frame"] svg')).not.toBeNull();
    expect(screen.getByText("Delegate research to Scout", { exact: false })).toBeInTheDocument();
  });

  it("omits the task description when the transcript never recorded one", () => {
    render(<DelegationEvent timestamp="2026-01-01T09:04:00.000Z" parentAgent="main" childAgent="Scout" task={null} />);

    expect(screen.queryByText(/Task:/)).toBeNull();
  });

  it("renders a script inside the task description as inert text rather than executing it (E3-S7-AC7)", () => {
    const { container } = render(
      <DelegationEvent
        timestamp="2026-01-01T09:04:00.000Z"
        parentAgent="main"
        childAgent="Scout"
        task={"<script>window.__pwned = true;</script>Research the API"}
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container).toHaveTextContent("Research the API");
  });
});