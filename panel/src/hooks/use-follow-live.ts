"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export interface UseFollowLiveOptions {
  eventCount: number;
  timelineRef: RefObject<HTMLElement | null>;
  liveAnchorRef: RefObject<HTMLElement | null>;
}

export interface UseFollowLiveResult {
  isFollowing: boolean;
  returnToLive: () => void;
}

function isAtNewestEvent(timeline: HTMLElement): boolean {
  return timeline.getBoundingClientRect().bottom <= window.innerHeight + 1;
}

export function useFollowLive({ eventCount, timelineRef, liveAnchorRef }: UseFollowLiveOptions): UseFollowLiveResult {
  const [isFollowing, setIsFollowing] = useState(true);
  const previousEventCount = useRef(eventCount);

  const scrollToLive = useCallback(() => {
    liveAnchorRef.current?.scrollIntoView?.({ block: "end" });
  }, [liveAnchorRef]);

  const updateFollowing = useCallback(() => {
    const timeline = timelineRef.current;
    if (timeline) setIsFollowing(isAtNewestEvent(timeline));
  }, [timelineRef]);

  useEffect(() => {
    updateFollowing();
    window.addEventListener("scroll", updateFollowing, { passive: true });
    window.addEventListener("resize", updateFollowing);
    return () => {
      window.removeEventListener("scroll", updateFollowing);
      window.removeEventListener("resize", updateFollowing);
    };
  }, [updateFollowing]);

  useEffect(() => {
    const previousCount = previousEventCount.current;
    previousEventCount.current = eventCount;
    if (eventCount > previousCount && isFollowing) scrollToLive();
  }, [eventCount, isFollowing, scrollToLive]);

  const returnToLive = useCallback(() => {
    setIsFollowing(true);
    scrollToLive();
  }, [scrollToLive]);

  return { isFollowing, returnToLive };
}
