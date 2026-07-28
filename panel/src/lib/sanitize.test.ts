import { describe, expect, it } from "vitest";
import { sanitizeText } from "./sanitize";

describe("sanitizeText", () => {
  it("removes a script block and everything inside it (E3-S7-AC7)", () => {
    const out = sanitizeText('before<script>alert("x")</script>after');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
    expect(out).toBe("beforeafter");
  });

  it("removes a style block and everything inside it", () => {
    const out = sanitizeText("before<style>body{color:red}</style>after");
    expect(out).not.toContain("<style");
    expect(out).not.toContain("color:red");
    expect(out).toBe("beforeafter");
  });

  it("strips inline tags but keeps their readable inner text", () => {
    const out = sanitizeText("<b>bold</b> and <em>emphasis</em>");
    expect(out).not.toContain("<b>");
    expect(out).not.toContain("<em>");
    expect(out).toBe("bold and emphasis");
  });

  it("strips a self-closing tag carrying an event-handler attribute", () => {
    const out = sanitizeText('before<img src="x" onerror="alert(1)">after');
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("<img");
    expect(out).toBe("beforeafter");
  });

  it("leaves plain text with non-tag angle brackets untouched", () => {
    const out = sanitizeText("1 < 2 and 3 > 1");
    expect(out).toBe("1 < 2 and 3 > 1");
  });

  it("passes ordinary text through unchanged", () => {
    const out = sanitizeText("Please refactor the billing module.");
    expect(out).toBe("Please refactor the billing module.");
  });

  it("handles an empty string without throwing", () => {
    expect(sanitizeText("")).toBe("");
  });
});