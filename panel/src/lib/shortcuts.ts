/**
 * Single source of truth for the panel's keyboard shortcuts. Both
 * `use-list-keyboard` and `use-timeline-keyboard` match keydown events
 * against these definitions rather than comparing raw key strings inline,
 * so a shortcut's key and modifier live in exactly one place.
 */
export interface ShortcutDefinition {
  key: string;
  shiftKey?: boolean;
}

/** True when `event` carries exactly this shortcut's key (case-insensitively) and modifier. */
export function matchesShortcut(event: KeyboardEvent | React.KeyboardEvent, shortcut: ShortcutDefinition): boolean {
  return event.key.toLowerCase() === shortcut.key.toLowerCase() && Boolean(event.shiftKey) === Boolean(shortcut.shiftKey);
}

/** The session list's own conventions (E3-S11-AC1) - DESIGN-SYSTEM.md does not prescribe these. */
export const LIST_SHORTCUTS = {
  next: { key: "ArrowDown" },
  previous: { key: "ArrowUp" },
  confirm: { key: "Enter" },
} as const satisfies Record<string, ShortcutDefinition>;

/** The timeline's shortcuts, verbatim from DESIGN-SYSTEM.md section 20.4 (E3-S11-AC2). */
export const TIMELINE_SHORTCUTS = {
  next: { key: "j" },
  previous: { key: "k" },
  expand: { key: "Enter" },
  openInInspector: { key: "Enter", shiftKey: true },
  clear: { key: "Escape" },
} as const satisfies Record<string, ShortcutDefinition>;
