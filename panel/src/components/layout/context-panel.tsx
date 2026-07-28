"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  CONTEXT_PANEL_DEFAULT_WIDTH,
  CONTEXT_PANEL_MAX_WIDTH,
  CONTEXT_PANEL_MIN_WIDTH,
  clampContextPanelWidth,
} from "@/lib/panel-size";

export interface ContextPanelProps {
  children?: ReactNode;
}

/**
 * DESIGN-SYSTEM.md section 5.3 ("Context Panel") - the structural region at
 * its documented default width (see src/styles/shell.css), with a draggable
 * divider on its trailing edge that clamps the resulting width to
 * 280px-360px via clampContextPanelWidth (E2-S2-AC5). The panel sits inside
 * a flex row whose main-workspace sibling is `flex: 1 1 auto`, so shrinking
 * or growing this pane's explicit width complementarily resizes that one.
 * Its content changes per selected area; that per-area content lands in
 * later tasks.
 */
export function ContextPanel({ children }: ContextPanelProps) {
  const [width, setWidth] = useState(CONTEXT_PANEL_DEFAULT_WIDTH);
  const dragOrigin = useRef<{ pointerX: number; width: number } | null>(null);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const origin = dragOrigin.current;
    if (!origin) return;
    setWidth(clampContextPanelWidth(origin.width + (event.clientX - origin.pointerX)));
  }, []);

  const stopDragging = useCallback(() => {
    dragOrigin.current = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", stopDragging);
  }, [handlePointerMove]);

  const startDragging = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      dragOrigin.current = { pointerX: event.clientX, width };
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopDragging);
    },
    [handlePointerMove, stopDragging, width],
  );

  return (
    <aside className="context-panel" aria-label="Context" style={{ width, position: "relative" }}>
      {children}
      <div
        role="separator"
        aria-label="Resize context panel"
        aria-orientation="vertical"
        aria-valuemin={CONTEXT_PANEL_MIN_WIDTH}
        aria-valuemax={CONTEXT_PANEL_MAX_WIDTH}
        aria-valuenow={width}
        className="context-panel__divider"
        style={{
          bottom: 0,
          cursor: "col-resize",
          position: "absolute",
          right: -3,
          top: 0,
          width: 6,
        }}
        onPointerDown={startDragging}
      />
    </aside>
  );
}