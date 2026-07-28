import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../app/globals.css";
import { EventFrame, formatEventDuration } from "./event-frame";

describe("formatEventDuration", () => {
  it("formats sub-second durations in milliseconds", () => {
    expect(formatEventDuration(345)).toBe("345ms");
  });

  it("formats sub-minute durations in whole seconds", () => {
    expect(formatEventDuration(5000)).toBe("5s");
  });

  it("formats multi-minute durations in minutes and seconds", () => {
    expect(formatEventDuration(65_000)).toBe("1m 05s");
  });
});

describe("EventFrame", () => {
  it("renders the icon, label, agent, timestamp and duration alongside its content", () => {
    render(
      <EventFrame
        icon={<svg data-testid="frame-icon" />}
        label="bash"
        agent="Developer"
        timestamp="2026-01-01T09:06:00.000Z"
        duration="5s"
      >
        <p>Body content</p>
      </EventFrame>,
    );

    expect(screen.getByTestId("frame-icon")).toBeInTheDocument();
    expect(screen.getByText("bash")).toBeInTheDocument();
    expect(screen.getByText("Developer")).toBeInTheDocument();
    expect(screen.getByText("5s")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();

    const time = document.querySelector('time[datetime="2026-01-01T09:06:00.000Z"]');
    expect(time).toHaveTextContent(/\S/);
  });

  it("carries an error status as a border accent while keeping its own surface transparent", () => {
    const { container } = render(
      <EventFrame icon={<svg />} label="Failed" timestamp="2026-01-01T09:06:00.000Z" status="error" />,
    );
    const frame = container.firstElementChild as Element;

    expect(frame).toHaveClass("border-l-destructive");
    expect(getComputedStyle(frame).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });

  it("omits the content row entirely when no children are given, keeping a single-line event to one row", () => {
    const { container } = render(<EventFrame icon={<svg />} label="bash" timestamp="2026-01-01T09:06:00.000Z" />);

    expect(container.querySelector('[data-slot="event-content"]')).toBeNull();
  });
});
