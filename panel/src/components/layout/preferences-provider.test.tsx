import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_PREFERENCES, PREFERENCES_STORAGE_KEY } from "@/lib/preferences";
import { PreferencesProvider, usePreferences } from "@/components/layout/preferences-provider";

function createStorage(): Storage {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

let storage: Storage;
let initialViewportWidth: number;

function PreferenceSnapshot() {
  const { preferences } = usePreferences();

  return <output>{`${preferences.theme}:${preferences.navigationCollapsed}:${preferences.contextPanelWidth}`}</output>;
}

function PreferenceControls() {
  const { setNavigationCollapsed, setTheme } = usePreferences();

  return (
    <>
      <button type="button" onClick={() => setTheme("light")}>
        Use light theme
      </button>
      <button type="button" onClick={() => setNavigationCollapsed(true)}>
        Collapse navigation
      </button>
    </>
  );
}

describe("PreferencesProvider", () => {
  beforeEach(() => {
    initialViewportWidth = window.innerWidth;
    storage = createStorage();
    vi.stubGlobal("localStorage", storage);
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: initialViewportWidth,
    });
    vi.unstubAllGlobals();
    document.documentElement.classList.remove("dark");
  });

  it("[E2-S3-AC1] restores a light theme and collapsed navigation after a reload", async () => {
    storage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        theme: "light",
        navigationCollapsed: true,
        contextPanelWidth: 320,
      }),
    );

    render(
      <PreferencesProvider>
        <PreferenceSnapshot />
      </PreferencesProvider>,
    );

    await waitFor(() => expect(screen.getByText("light:true:320")).toBeInTheDocument());
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("[E2-S3-AC1] persists changed theme and navigation values for a fresh provider", async () => {
    const user = userEvent.setup();
    storage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        theme: "dark",
        navigationCollapsed: false,
        contextPanelWidth: 320,
      }),
    );

    const firstRender = render(
      <PreferencesProvider>
        <PreferenceControls />
        <PreferenceSnapshot />
      </PreferencesProvider>,
    );

    await waitFor(() => expect(screen.getByText("dark:false:320")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Use light theme" }));
    await user.click(screen.getByRole("button", { name: "Collapse navigation" }));
    await waitFor(() => expect(screen.getByText("light:true:320")).toBeInTheDocument());
    await waitFor(() =>
      expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBe(
        JSON.stringify({
          theme: "light",
          navigationCollapsed: true,
          contextPanelWidth: 320,
        }),
      ),
    );

    firstRender.unmount();
    render(
      <PreferencesProvider>
        <PreferenceSnapshot />
      </PreferencesProvider>,
    );

    await waitFor(() => expect(screen.getByText("light:true:320")).toBeInTheDocument());
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("[E2-S3-AC2] clamps an over-wide stored panel so an expanded navigation leaves workspace room", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 500 });
    storage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        theme: "light",
        navigationCollapsed: false,
        contextPanelWidth: 860,
      }),
    );

    render(
      <PreferencesProvider>
        <PreferenceSnapshot />
      </PreferencesProvider>,
    );

    await waitFor(() => expect(screen.getByText("light:false:291")).toBeInTheDocument());
    expect(window.innerWidth - 208 - 291).toBeGreaterThan(0);
  });

  it.each([
    ["corrupt JSON", "{not valid JSON"],
    [
      "an object with unexpected fields",
      JSON.stringify({
        theme: "light",
        navigationCollapsed: false,
        contextPanelWidth: 320,
        unexpected: true,
      }),
    ],
  ])("[E2-S3-AC4] discards %s and still supplies documented defaults", async (_description, serialized) => {
    storage.setItem(PREFERENCES_STORAGE_KEY, serialized);

    render(
      <PreferencesProvider>
        <PreferenceSnapshot />
      </PreferencesProvider>,
    );

    await waitFor(() => expect(screen.getByText("light:false:320")).toBeInTheDocument());
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBe(JSON.stringify(DEFAULT_PREFERENCES));
  });

  it("[E2-S3-AC3] supplies documented defaults for absent preferences without recording an error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      render(
        <PreferencesProvider>
          <PreferenceSnapshot />
        </PreferencesProvider>,
      );

      await waitFor(() => expect(screen.getByText("light:false:320")).toBeInTheDocument());
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});