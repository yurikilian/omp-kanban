import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { useTimelineKeyboard } from "./use-timeline-keyboard";

function TestTimeline({
  eventIds = ["e1", "e2", "e3"],
  onExpand = vi.fn(),
  onOpenInspector = vi.fn(),
  onClear = vi.fn(),
}: {
  eventIds?: string[];
  onExpand?: (eventId: string) => void;
  onOpenInspector?: (eventId: string) => void;
  onClear?: () => void;
}) {
  const { focusedEventId, containerKeyDownProps } = useTimelineKeyboard({ eventIds, onExpand, onOpenInspector, onClear });

  return createElement(
    "div",
    { "data-testid": "timeline", tabIndex: 0, ...containerKeyDownProps },
    `focused: ${focusedEventId ?? "none"}`,
  );
}

describe("useTimelineKeyboard", () => {
  it("has no focused event until the first navigation key is pressed", () => {
    render(createElement(TestTimeline, {}));
    expect(screen.getByTestId("timeline")).toHaveTextContent("focused: none");
  });

  it("moves to the next event on j and the previous event on k, one event per press (E3-S11-AC2)", () => {
    render(createElement(TestTimeline, {}));
    const timeline = screen.getByTestId("timeline");

    fireEvent.keyDown(timeline, { key: "j" });
    expect(timeline).toHaveTextContent("focused: e1");

    fireEvent.keyDown(timeline, { key: "j" });
    expect(timeline).toHaveTextContent("focused: e2");

    fireEvent.keyDown(timeline, { key: "k" });
    expect(timeline).toHaveTextContent("focused: e1");
  });

  it("clamps at the last and first event rather than wrapping", () => {
    render(createElement(TestTimeline, { eventIds: ["e1", "e2"] }));
    const timeline = screen.getByTestId("timeline");

    fireEvent.keyDown(timeline, { key: "j" });
    fireEvent.keyDown(timeline, { key: "j" });
    fireEvent.keyDown(timeline, { key: "j" });
    expect(timeline).toHaveTextContent("focused: e2");

    fireEvent.keyDown(timeline, { key: "k" });
    fireEvent.keyDown(timeline, { key: "k" });
    fireEvent.keyDown(timeline, { key: "k" });
    expect(timeline).toHaveTextContent("focused: e1");
  });

  it("expands the focused event on Enter (E3-S11-AC2)", () => {
    const onExpand = vi.fn();
    render(createElement(TestTimeline, { onExpand }));
    const timeline = screen.getByTestId("timeline");

    fireEvent.keyDown(timeline, { key: "j" });
    fireEvent.keyDown(timeline, { key: "Enter" });

    expect(onExpand).toHaveBeenCalledExactlyOnceWith("e1");
  });

  it("opens the focused event in the inspector on Shift+Enter, distinct from plain Enter (E3-S11-AC2)", () => {
    const onExpand = vi.fn();
    const onOpenInspector = vi.fn();
    render(createElement(TestTimeline, { onExpand, onOpenInspector }));
    const timeline = screen.getByTestId("timeline");

    fireEvent.keyDown(timeline, { key: "j" });
    fireEvent.keyDown(timeline, { key: "Enter", shiftKey: true });

    expect(onOpenInspector).toHaveBeenCalledExactlyOnceWith("e1");
    expect(onExpand).not.toHaveBeenCalled();
  });

  it("does nothing for Enter/Shift+Enter before any event has focus", () => {
    const onExpand = vi.fn();
    const onOpenInspector = vi.fn();
    render(createElement(TestTimeline, { onExpand, onOpenInspector }));

    fireEvent.keyDown(screen.getByTestId("timeline"), { key: "Enter" });

    expect(onExpand).not.toHaveBeenCalled();
    expect(onOpenInspector).not.toHaveBeenCalled();
  });

  it("clears the selection on Escape without losing the keyboard cursor position (E3-S11-AC2)", () => {
    const onClear = vi.fn();
    render(createElement(TestTimeline, { onClear }));
    const timeline = screen.getByTestId("timeline");

    fireEvent.keyDown(timeline, { key: "j" });
    fireEvent.keyDown(timeline, { key: "j" });
    fireEvent.keyDown(timeline, { key: "Escape" });

    expect(onClear).toHaveBeenCalledOnce();
    // The cursor itself is untouched - Escape dismisses the inspector, not your place in the list.
    expect(timeline).toHaveTextContent("focused: e2");
  });

  it("does nothing for an empty timeline", () => {
    const onExpand = vi.fn();
    render(createElement(TestTimeline, { eventIds: [], onExpand }));
    const timeline = screen.getByTestId("timeline");

    fireEvent.keyDown(timeline, { key: "j" });
    expect(timeline).toHaveTextContent("focused: none");
  });
});
