import { afterEach, describe, expect, it } from "vitest";
import { applyTheme, getTheme, toggleTheme } from "@/lib/theme";

describe("theme resolver", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("applying the dark theme adds the .dark class to the document root", () => {
    applyTheme("dark");

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(getTheme()).toBe("dark");
  });

  it("applying the light theme removes the .dark class from the document root", () => {
    document.documentElement.classList.add("dark");

    applyTheme("light");

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(getTheme()).toBe("light");
  });

  it("toggling flips the current theme and returns the new value", () => {
    applyTheme("light");

    expect(toggleTheme()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    expect(toggleTheme()).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
