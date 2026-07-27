import type { ReactNode } from "react";

export interface ContextPanelProps {
  children?: ReactNode;
}

/**
 * DESIGN-SYSTEM.md section 5.3 ("Context Panel") - the structural region at
 * its documented default width (see src/styles/shell.css). Its content
 * changes per selected area (search, filters, session list, ...); that
 * per-area content lands in later tasks. Making the divider draggable and
 * clamping the resulting width to 280px-360px is T20's scope.
 */
export function ContextPanel({ children }: ContextPanelProps) {
  return (
    <aside className="context-panel" aria-label="Context">
      {children}
    </aside>
  );
}
