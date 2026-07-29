"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, Ref } from "react";
import { LIST_SHORTCUTS, matchesShortcut } from "@/lib/shortcuts";

export interface UseListKeyboardResult<Element extends HTMLElement> {
  /** The index currently reachable by Tab and moved by the arrow keys. */
  focusedIndex: number;
  /** Spread onto row `index` - carries the roving tabindex. */
  getItemProps: (index: number) => { tabIndex: number; ref: Ref<Element> };
  /** Spread onto the element wrapping every row. */
  containerKeyDownProps: { onKeyDown: (event: ReactKeyboardEvent) => void };
}

/**
 * Roving-tabindex keyboard navigation for a one-dimensional list of rows:
 * the down/up arrow keys move focus one row per press, clamped to the
 * list's bounds, scrolling the newly-focused row into view and giving it
 * the browser's own visible focus ring rather than a fake highlight; the
 * confirm key activates the focused row (E3-S11-AC1).
 */
export function useListKeyboard<Element extends HTMLElement = HTMLElement>(
  itemCount: number,
  onConfirm: (index: number) => void,
): UseListKeyboardResult<Element> {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const itemElements = useRef<Array<Element | null>>([]);

  useEffect(() => {
    setFocusedIndex((current) => Math.max(0, Math.min(itemCount - 1, current)));
  }, [itemCount]);

  const getItemProps = useCallback(
    (index: number) => ({
      tabIndex: index === focusedIndex ? 0 : -1,
      ref: (element: Element | null) => {
        itemElements.current[index] = element;
      },
    }),
    [focusedIndex],
  );

  const moveFocus = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(itemCount - 1, nextIndex));
      setFocusedIndex(clamped);

      const element = itemElements.current[clamped];
      element?.focus();
      element?.scrollIntoView({ block: "nearest" });
    },
    [itemCount],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (itemCount === 0) return;

      if (matchesShortcut(event, LIST_SHORTCUTS.next)) {
        event.preventDefault();
        moveFocus(focusedIndex + 1);
      } else if (matchesShortcut(event, LIST_SHORTCUTS.previous)) {
        event.preventDefault();
        moveFocus(focusedIndex - 1);
      } else if (matchesShortcut(event, LIST_SHORTCUTS.confirm)) {
        event.preventDefault();
        onConfirm(focusedIndex);
      }
    },
    [focusedIndex, itemCount, moveFocus, onConfirm],
  );

  return { focusedIndex, getItemProps, containerKeyDownProps: { onKeyDown } };
}
