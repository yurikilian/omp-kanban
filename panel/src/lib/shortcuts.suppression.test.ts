import { describe, expect, it } from "vitest";
import { matchesShortcut, TIMELINE_SHORTCUTS } from "./shortcuts";

describe("matchesShortcut", () => {
  it("does not match a letter typed into a text input (E3-S11-AC3)", () => {
    const input = document.createElement("input");
    input.type = "search";
    const event = new KeyboardEvent("keydown", { key: "j", bubbles: true });
    Object.defineProperty(event, "target", { value: input });

    expect(matchesShortcut(event, TIMELINE_SHORTCUTS.next)).toBe(false);
  });
});
