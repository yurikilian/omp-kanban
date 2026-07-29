"use client";

import { useWindowVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { useRef } from "react";

export interface WindowedItem<T> {
  event: T;
  virtualItem: VirtualItem;
}

export interface UseWindowedEventsResult<T> {
  /** Attach to the list's own container so offsets stay relative to it, not the page top. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Only the events currently near the viewport (plus overscan) - never the whole list. */
  items: WindowedItem<T>[];
  /** The full scrollable height every windowed event would occupy, so the page scrollbar stays accurate. */
  totalSize: number;
  /** Ref callback that lets the virtualizer replace its height estimate with the row's real, measured height. */
  measureElement: (node: Element | null) => void;
}

// A rough starting guess for one event row's height before it has ever
// been measured. Event rows vary widely (a one-line tool call vs. a
// multi-paragraph response), so this only seeds the scrollbar/positioning
// math - `measureElement` corrects it per row once mounted.
const ESTIMATED_EVENT_HEIGHT_PX = 88;

// Extra rows kept mounted just past the viewport on each side so a fast
// scroll or a screen reader's virtual cursor never outruns rendered content.
const OVERSCAN_EVENT_COUNT = 12;

/**
 * Windows a session timeline's events against the page's own scroll
 * position instead of committing every event to the DOM at once - a
 * 2,000-event transcript stays interactive because only the events near
 * the viewport ever mount, in their original chronological order
 * (E3-S7-AC5). Uses `@tanstack/react-virtual`'s window virtualizer, not a
 * dedicated scroll container, because the timeline scrolls with the page
 * itself; grouping repetitive events or paging were the other options
 * this task's intent named, but they either change what a scroll shows or
 * add manual "load more" interaction the virtualizer avoids.
 */
export function useWindowedEvents<T>(events: T[]): UseWindowedEventsResult<T> {
  const containerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useWindowVirtualizer({
    count: events.length,
    estimateSize: () => ESTIMATED_EVENT_HEIGHT_PX,
    overscan: OVERSCAN_EVENT_COUNT,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
  });

  const items = virtualizer.getVirtualItems().map((virtualItem) => ({
    event: events[virtualItem.index],
    virtualItem,
  }));

  return {
    containerRef,
    items,
    totalSize: virtualizer.getTotalSize(),
    measureElement: virtualizer.measureElement,
  };
}