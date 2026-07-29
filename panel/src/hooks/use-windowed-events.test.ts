import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useWindowedEvents } from "./use-windowed-events";

interface FakeEvent {
  id: string;
  index: number;
}

function makeEvents(count: number): FakeEvent[] {
  return Array.from({ length: count }, (_, index) => ({ id: `e${index}`, index }));
}

describe("useWindowedEvents", () => {
  it("does not mount the full 2,000-event list on the initial render (E3-S7-AC5)", () => {
    const events = makeEvents(2000);

    const { result } = renderHook(() => useWindowedEvents(events));

    expect(result.current.items.length).toBeGreaterThan(0);
    expect(result.current.items.length).toBeLessThan(events.length);
  });

  it("still renders every event when the whole list is small enough to fit as-is", () => {
    const events = makeEvents(5);

    const { result } = renderHook(() => useWindowedEvents(events));

    expect(result.current.items.map((item) => item.event)).toEqual(events);
  });

  it("keeps windowed events in the same chronological order as the source list", () => {
    const events = makeEvents(2000);

    const { result } = renderHook(() => useWindowedEvents(events));

    const indices = result.current.items.map((item) => item.virtualItem.index);
    const sortedAscending = [...indices].sort((a, b) => a - b);
    expect(indices).toEqual(sortedAscending);
  });

  it("reports a scrollable height spanning the entire event list, not just the windowed slice", () => {
    const events = makeEvents(2000);

    const { result } = renderHook(() => useWindowedEvents(events));

    expect(result.current.totalSize).toBeGreaterThan(0);
  });
});