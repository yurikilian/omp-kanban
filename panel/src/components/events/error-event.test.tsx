import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../app/globals.css";
import { ErrorEvent } from "./error-event";

describe("ErrorEvent", () => {
  it("carries an icon and failure text without a full-bleed red surface (E3-S7-AC1)", () => {
    const { container } = render(
      <ErrorEvent timestamp="2026-01-01T09:07:00.000Z" agent="main" text="Tool execution failed: exit code 1" />,
    );

    expect(screen.getByText("Tool execution failed: exit code 1")).toBeInTheDocument();

    const frame = container.querySelector('[data-slot="event-frame"]') as Element;
    expect(frame).not.toBeNull();
    expect(frame.querySelector("svg")).not.toBeNull();
    expect(frame).toHaveClass("border-l-destructive");
    // A border accent, never a filled background - an error stays visible
    // without painting a full-bleed red surface (E3-S7-AC1).
    expect(getComputedStyle(frame).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });

  it("renders a script inside the error text as inert text rather than executing it (E3-S7-AC7)", () => {
    const { container } = render(
      <ErrorEvent
        timestamp="2026-01-01T09:07:00.000Z"
        agent="main"
        text={"<script>window.__pwned = true;</script>Connection refused"}
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container).toHaveTextContent("Connection refused");
  });
});