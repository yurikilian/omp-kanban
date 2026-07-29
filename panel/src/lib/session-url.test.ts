import { describe, expect, it } from "vitest";
import { eventIdFromSearchParam, sessionEventUrl } from "./session-url";

describe("eventIdFromSearchParam", () => {
  it("accepts a selected event from a session deep-link query (E3-S10-AC2)", () => {
    expect(eventIdFromSearchParam("main:m31")).toBe("main:m31");
  });

  it("ignores empty and repeated event query values (E3-S10-AC3)", () => {
    expect(eventIdFromSearchParam("")).toBeUndefined();
    expect(eventIdFromSearchParam(null)).toBeUndefined();
    expect(eventIdFromSearchParam(["main:m31", "main:m32"])).toBeUndefined();
  });
});

describe("sessionEventUrl", () => {
  it("creates a session URL whose query carries the selected event identifier (E3-S10-AC1)", () => {
    expect(sessionEventUrl("session 42", "main:m31")).toBe("/sessions/session%2042?event=main%3Am31");
  });
});