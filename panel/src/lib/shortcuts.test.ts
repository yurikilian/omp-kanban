import { describe, expect, it } from "vitest";
import { LIST_SHORTCUTS, matchesShortcut, TIMELINE_SHORTCUTS } from "./shortcuts";

function keyDown(key: string, overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, shiftKey: false, ...overrides });
}

describe("matchesShortcut", () => {
  it("matches a plain key regardless of case", () => {
    expect(matchesShortcut(keyDown("j"), TIMELINE_SHORTCUTS.next)).toBe(true);
    expect(matchesShortcut(keyDown("J"), TIMELINE_SHORTCUTS.next)).toBe(true);
  });

  it("does not match a different key", () => {
    expect(matchesShortcut(keyDown("k"), TIMELINE_SHORTCUTS.next)).toBe(false);
  });

  it("requires shiftKey to match exactly when the shortcut specifies it", () => {
    expect(matchesShortcut(keyDown("Enter", { shiftKey: true }), TIMELINE_SHORTCUTS.openInInspector)).toBe(true);
    expect(matchesShortcut(keyDown("Enter", { shiftKey: false }), TIMELINE_SHORTCUTS.openInInspector)).toBe(false);
  });

  it("requires shiftKey to be absent when the shortcut does not specify it (Enter vs Shift+Enter are distinct)", () => {
    expect(matchesShortcut(keyDown("Enter", { shiftKey: false }), TIMELINE_SHORTCUTS.expand)).toBe(true);
    expect(matchesShortcut(keyDown("Enter", { shiftKey: true }), TIMELINE_SHORTCUTS.expand)).toBe(false);
  });

  it("exposes the documented list shortcuts (E3-S11-AC1)", () => {
    expect(matchesShortcut(keyDown("ArrowDown"), LIST_SHORTCUTS.next)).toBe(true);
    expect(matchesShortcut(keyDown("ArrowUp"), LIST_SHORTCUTS.previous)).toBe(true);
    expect(matchesShortcut(keyDown("Enter"), LIST_SHORTCUTS.confirm)).toBe(true);
  });

  it("exposes the documented timeline shortcuts from DESIGN-SYSTEM.md section 20.4 (E3-S11-AC2)", () => {
    expect(matchesShortcut(keyDown("j"), TIMELINE_SHORTCUTS.next)).toBe(true);
    expect(matchesShortcut(keyDown("k"), TIMELINE_SHORTCUTS.previous)).toBe(true);
    expect(matchesShortcut(keyDown("Enter"), TIMELINE_SHORTCUTS.expand)).toBe(true);
    expect(matchesShortcut(keyDown("Enter", { shiftKey: true }), TIMELINE_SHORTCUTS.openInInspector)).toBe(true);
    expect(matchesShortcut(keyDown("Escape"), TIMELINE_SHORTCUTS.clear)).toBe(true);
  });
});
