import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../app/globals.css";
import { ResponseEvent } from "./response-event";

describe("ResponseEvent", () => {
  it("renders the response text inside a bounded reading column (E3-S7-AC1)", () => {
    const { container } = render(
      <ResponseEvent
        agent="main"
        timestamp="2026-01-01T09:05:00.000Z"
        text="Sure, starting now."
        model={null}
        durationMs={null}
        inputTokens={null}
        outputTokens={null}
        costUsd={null}
      />,
    );

    expect(screen.getByText("Sure, starting now.")).toBeInTheDocument();
    const content = container.querySelector('[data-slot="event-content"]') as Element;
    const column = content.firstElementChild as Element;
    const { maxWidth } = getComputedStyle(column);
    expect(maxWidth).toBe("672px");
    expect(maxWidth).not.toBe("auto");
  });

  it("renders model, duration, tokens and cost as secondary text (E3-S7-AC4)", () => {
    render(
      <ResponseEvent
        agent="main"
        timestamp="2026-01-01T09:05:00.000Z"
        text="Sure, starting now."
        model="claude-sonnet-5"
        durationMs={60_000}
        inputTokens={1000}
        outputTokens={200}
        costUsd={0.01}
      />,
    );

    const metadata = document.querySelector('[data-slot="response-metadata"]');
    expect(metadata).not.toBeNull();
    expect(metadata).toHaveClass("text-muted-foreground");
    expect(metadata).toHaveTextContent("claude-sonnet-5");
    expect(metadata).toHaveTextContent("1m 00s");
    expect(metadata).toHaveTextContent("1.0K in");
    expect(metadata).toHaveTextContent("200 out");
    expect(metadata).toHaveTextContent("$0.01");
  });

  it("omits every metadata value the transcript never recorded, rather than showing it as zero (E3-S7-AC4)", () => {
    render(
      <ResponseEvent
        agent="main"
        timestamp="2026-01-01T09:05:00.000Z"
        text="No usage field on this turn."
        model={null}
        durationMs={null}
        inputTokens={null}
        outputTokens={null}
        costUsd={null}
      />,
    );

    expect(document.querySelector('[data-slot="response-metadata"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\$0\.00|0 tokens|\b0 in\b|\b0 out\b|NaN/);
  });

  it("omits only the specific values a partially-recorded turn is missing (E3-S7-AC4)", () => {
    render(
      <ResponseEvent
        agent="main"
        timestamp="2026-01-01T09:05:00.000Z"
        text="Partial usage."
        model="claude-sonnet-5"
        durationMs={null}
        inputTokens={null}
        outputTokens={null}
        costUsd={null}
      />,
    );

    const metadata = document.querySelector('[data-slot="response-metadata"]') as Element;
    expect(metadata).toHaveTextContent("claude-sonnet-5");
    expect(metadata.textContent).not.toMatch(/\$0\.00|0 tokens|in|out/);
  });
});
