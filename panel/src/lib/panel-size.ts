/**
 * DESIGN-SYSTEM.md section 5 - the context panel's permitted width range
 * (280px-360px, section 5.3). Shared between the divider drag handler
 * (ContextPanel, E2-S2-AC5) and the stored-preference restore path (T30) so
 * both clamp against the same bounds instead of reimplementing them.
 */
export const CONTEXT_PANEL_MIN_WIDTH = 280;
export const CONTEXT_PANEL_MAX_WIDTH = 360;
export const CONTEXT_PANEL_DEFAULT_WIDTH = 320;

export function clampContextPanelWidth(width: number): number {
  return Math.min(CONTEXT_PANEL_MAX_WIDTH, Math.max(CONTEXT_PANEL_MIN_WIDTH, width));
}