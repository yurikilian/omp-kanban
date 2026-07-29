import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFollowLive } from "./use-follow-live";

function createRefs(bottom: number) {
  const timeline = document.createElement("div");
  Object.defineProperty(timeline, "getBoundingClientRect", {
    value: () => ({ bottom }),
  });
  const anchor = document.createElement("div");
  anchor.scrollIntoView = vi.fn();

  return { timelineRef: { current: timeline }, liveAnchorRef: { current: anchor }, scrollIntoView: anchor.scrollIntoView };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useFollowLive", () => {
  it("does not move a timeline scrolled away from the newest event when events arrive (E3-S9-AC3)", () => {
    const { timelineRef, liveAnchorRef, scrollIntoView } = createRefs(window.innerHeight + 2);
    const { result, rerender } = renderHook(({ eventCount }) => useFollowLive({ eventCount, timelineRef, liveAnchorRef }), {
      initialProps: { eventCount: 1 },
    });

    act(() => window.dispatchEvent(new Event("scroll")));
    expect(result.current.isFollowing).toBe(false);

    rerender({ eventCount: 2 });

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("follows new events when the timeline is already at its newest event (E3-S9-AC3)", () => {
    const { timelineRef, liveAnchorRef, scrollIntoView } = createRefs(window.innerHeight);
    const { rerender } = renderHook(({ eventCount }) => useFollowLive({ eventCount, timelineRef, liveAnchorRef }), {
      initialProps: { eventCount: 1 },
    });

    rerender({ eventCount: 2 });

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "end" });
  });

  it("restores following when returning to the live timeline (E3-S9-AC3)", () => {
    const { timelineRef, liveAnchorRef, scrollIntoView } = createRefs(window.innerHeight + 2);
    const { result } = renderHook(() => useFollowLive({ eventCount: 1, timelineRef, liveAnchorRef }));

    act(() => window.dispatchEvent(new Event("scroll")));
    act(() => result.current.returnToLive());

    expect(result.current.isFollowing).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "end" });
  });
});
