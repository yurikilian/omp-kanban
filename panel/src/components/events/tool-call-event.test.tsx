import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../app/globals.css";
import { ToolCallEvent } from "./tool-call-event";

describe("ToolCallEvent", () => {
  it("collapses to a single line carrying the tool name, summary, duration and outcome (E3-S7-AC1)", () => {
    const { container } = render(
      <ToolCallEvent
        agent="main"
        timestamp="2026-01-01T09:06:00.000Z"
        toolName="bash"
        summary="Run the test suite"
        durationMs={5000}
        outcome="success"
      />,
    );

    const line = container.querySelector('[data-slot="tool-call-line"]') as Element;
    expect(line).not.toBeNull();
    expect(line).toHaveTextContent("bash");
    expect(line).toHaveTextContent("Run the test suite");
    expect(container).toHaveTextContent("5s");
    expect(line.querySelector("svg")).not.toBeNull();

    const style = getComputedStyle(line);
    expect(style.whiteSpace).toBe("nowrap");
    expect(style.overflow).toBe("hidden");
    expect(style.textOverflow).toBe("ellipsis");
  });

  it("marks a failed outcome as an error status on the shared frame without expanding into a card", () => {
    const { container } = render(
      <ToolCallEvent
        agent="main"
        timestamp="2026-01-01T09:06:00.000Z"
        toolName="bash"
        summary="Run the build"
        durationMs={701_000}
        outcome="error"
      />,
    );

    const frame = container.querySelector('[data-slot="event-frame"]') as Element;
    expect(frame).toHaveClass("border-l-destructive");
    expect(getComputedStyle(frame).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(container.querySelector('[data-slot="event-content"]')).toBeNull();
  });

  it("omits the duration segment for a tool call that has not finished yet", () => {
    const { container } = render(
      <ToolCallEvent
        agent="main"
        timestamp="2026-01-01T09:06:00.000Z"
        toolName="bash"
        summary="Still running"
        durationMs={null}
        outcome="pending"
      />,
    );

    expect(container.querySelector('[data-slot="event-duration"]')).toBeNull();
  });

  it("renders a script inside the tool summary as inert text rather than executing it (E3-S7-AC7)", () => {
    const { container } = render(
      <ToolCallEvent
        agent="main"
        timestamp="2026-01-01T09:06:00.000Z"
        toolName="bash"
        summary={"<script>window.__pwned = true;</script>rm -rf"}
        durationMs={100}
        outcome="success"
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container).toHaveTextContent("rm -rf");
  });
});
