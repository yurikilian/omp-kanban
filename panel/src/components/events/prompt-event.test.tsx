import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../app/globals.css";
import { PromptEvent } from "./prompt-event";

describe("PromptEvent", () => {
  it("renders the prompt text inside a bounded reading column (E3-S7-AC1)", () => {
    const { container } = render(
      <PromptEvent timestamp="2026-01-01T09:02:00.000Z" text="Please refactor the billing module." />,
    );

    expect(screen.getByText("Please refactor the billing module.")).toBeInTheDocument();
    const content = container.querySelector('[data-slot="event-content"]') as Element;
    const column = content.firstElementChild as Element;
    const { maxWidth } = getComputedStyle(column);
    expect(maxWidth).toBe("672px");
    expect(maxWidth).not.toBe("auto");
  });

  it("labels the event as coming from the user, distinct from an agent response", () => {
    render(<PromptEvent timestamp="2026-01-01T09:02:00.000Z" text="Hello" />);

    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("renders a script in the prompt as inert text rather than executing it (E3-S7-AC7)", () => {
    const { container } = render(
      <PromptEvent timestamp="2026-01-01T09:02:00.000Z" text={"<script>window.__pwned = true;</script>hi"} />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("hi")).toBeInTheDocument();
  });
});
