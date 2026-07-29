"use client";

import { useCallback, useEffect, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { matchesShortcut, TIMELINE_SHORTCUTS } from "@/lib/shortcuts";

export interface UseTimelineKeyboardOptions {
  /** Event ids in display order - only ids in this list are ever focusable. */
  eventIds: string[];
  onExpand: (eventId: string) => void;
  onOpenInspector: (eventId: string) => void;
  onClear: () => void;
}

export interface UseTimelineKeyboardResult {
  /** The event the next/previous keys move, and Enter/Shift+Enter act on. `undefined` until the first press. */
  focusedEventId: string | undefined;
  /** Spread onto the element wrapping the timeline's events. */
  containerKeyDownProps: { onKeyDown: (event: ReactKeyboardEvent) => void };
}

/**
 * Keyboard navigation for the timeline, matching DESIGN-SYSTEM.md section
 * 20.4: J/K move a keyboard cursor to the next/previous event one at a
 * time, Enter expands the focused event, Shift+Enter opens it in the
 * inspector, and Escape clears the selection without losing the cursor's
 * position (E3-S11-AC2). The cursor is a separate concept from "the
 * selection" (the inspector-visible event) so browsing with J/K does not
 * itself pop the inspector open - only Shift+Enter promotes a cursor
 * position into a selection.
 */
export function useTimelineKeyboard({
  eventIds,
  onExpand,
  onOpenInspector,
  onClear,
}: UseTimelineKeyboardOptions): UseTimelineKeyboardResult {
  const [focusedEventId, setFocusedEventId] = useState<string | undefined>(undefined);

  // An event that scrolled out of the windowed/filtered set (or vanished
  // with a live update) can no longer be a valid cursor position.
  useEffect(() => {
    if (focusedEventId !== undefined && !eventIds.includes(focusedEventId)) {
      setFocusedEventId(undefined);
    }
  }, [eventIds, focusedEventId]);

  const moveFocus = useCallback(
    (direction: 1 | -1) => {
      if (eventIds.length === 0) return;

      const currentIndex = focusedEventId ? eventIds.indexOf(focusedEventId) : -1;
      const nextIndex =
        currentIndex === -1
          ? (direction === 1 ? 0 : eventIds.length - 1)
          : Math.max(0, Math.min(eventIds.length - 1, currentIndex + direction));

      setFocusedEventId(eventIds[nextIndex]);
    },
    [eventIds, focusedEventId],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (matchesShortcut(event, TIMELINE_SHORTCUTS.next)) {
        event.preventDefault();
        moveFocus(1);
      } else if (matchesShortcut(event, TIMELINE_SHORTCUTS.previous)) {
        event.preventDefault();
        moveFocus(-1);
      } else if (matchesShortcut(event, TIMELINE_SHORTCUTS.expand)) {
        if (focusedEventId === undefined) return;
        event.preventDefault();
        onExpand(focusedEventId);
      } else if (matchesShortcut(event, TIMELINE_SHORTCUTS.openInInspector)) {
        if (focusedEventId === undefined) return;
        event.preventDefault();
        onOpenInspector(focusedEventId);
      } else if (matchesShortcut(event, TIMELINE_SHORTCUTS.clear)) {
        event.preventDefault();
        onClear();
      }
    },
    [focusedEventId, moveFocus, onExpand, onOpenInspector, onClear],
  );

  return { focusedEventId, containerKeyDownProps: { onKeyDown } };
}
