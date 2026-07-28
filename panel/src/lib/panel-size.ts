/**
 * DESIGN-SYSTEM.md section 5 - the context panel's permitted width range
 * (280px-360px, section 5.3). Shared between the divider drag handler
 * (ContextPanel, E2-S2-AC5) and the stored-preference restore path (T30) so
 * both clamp against the same bounds instead of reimplementing them.
 */
export const CONTEXT_PANEL_MIN_WIDTH = 280;
export const CONTEXT_PANEL_MAX_WIDTH = 360;
export const CONTEXT_PANEL_DEFAULT_WIDTH = 320;

/** Shell widths from DESIGN-SYSTEM.md section 5.2. */
export const NAVIGATION_COLLAPSED_WIDTH = 64;
export const NAVIGATION_EXPANDED_WIDTH = 208;
export const MAIN_WORKSPACE_MIN_WIDTH = 1;

export function clampContextPanelWidth(width: number): number {
  return Math.min(CONTEXT_PANEL_MAX_WIDTH, Math.max(CONTEXT_PANEL_MIN_WIDTH, width));
}

/**
 * A persisted width was captured under a possibly different viewport. Keep it
 * in the documented panel range when possible, but reserve workspace room
 * when that range would otherwise consume the available shell width.
 */
export function clampRestoredContextPanelWidth(
  width: number,
  viewportWidth: number,
  navigationCollapsed: boolean,
): number {
  const clampedWidth = clampContextPanelWidth(width);
  if (!Number.isFinite(viewportWidth)) return clampedWidth;

  const navigationWidth = navigationCollapsed ? NAVIGATION_COLLAPSED_WIDTH : NAVIGATION_EXPANDED_WIDTH;
  return Math.min(clampedWidth, Math.max(0, viewportWidth - navigationWidth - MAIN_WORKSPACE_MIN_WIDTH));
}