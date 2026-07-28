import {
  CONTEXT_PANEL_DEFAULT_WIDTH,
  clampContextPanelWidth,
  clampRestoredContextPanelWidth,
} from "@/lib/panel-size";
import type { Theme } from "@/lib/theme";

export const PREFERENCES_STORAGE_KEY = "omp-panel-preferences";

export interface PanelPreferences {
  theme: Theme;
  navigationCollapsed: boolean;
  contextPanelWidth: number;
}

export const DEFAULT_PREFERENCES: PanelPreferences = {
  theme: "light",
  navigationCollapsed: false,
  contextPanelWidth: CONTEXT_PANEL_DEFAULT_WIDTH,
};

export function getDefaultPreferences(): PanelPreferences {
  return { ...DEFAULT_PREFERENCES };
}

export type PreferencesStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

function discardStoredPreferences(storage: PreferencesStorage): void {
  try {
    storage.removeItem(PREFERENCES_STORAGE_KEY);
  } catch {
    // Browser storage can be unavailable in privacy-restricted contexts.
  }
}

function isStoredPreferences(value: unknown): value is PanelPreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  const preferences = value as Record<string, unknown>;
  const keys = Object.keys(preferences);
  if (
    keys.length !== 3 ||
    keys.some((key) => key !== "theme" && key !== "navigationCollapsed" && key !== "contextPanelWidth")
  ) {
    return false;
  }

  return (
    (preferences.theme === "dark" || preferences.theme === "light") &&
    typeof preferences.navigationCollapsed === "boolean" &&
    typeof preferences.contextPanelWidth === "number" &&
    Number.isFinite(preferences.contextPanelWidth)
  );
}

export function loadPreferences(
  storage: PreferencesStorage | null | undefined,
  viewportWidth = Number.POSITIVE_INFINITY,
): PanelPreferences {
  if (!storage) return getDefaultPreferences();

  let serialized: string | null;
  try {
    serialized = storage.getItem(PREFERENCES_STORAGE_KEY);
  } catch {
    return getDefaultPreferences();
  }

  if (serialized === null) return getDefaultPreferences();

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isStoredPreferences(parsed)) {
      discardStoredPreferences(storage);
      return getDefaultPreferences();
    }

    return {
      ...parsed,
      contextPanelWidth: clampRestoredContextPanelWidth(
        parsed.contextPanelWidth,
        viewportWidth,
        parsed.navigationCollapsed,
      ),
    };
  } catch {
    discardStoredPreferences(storage);
    return getDefaultPreferences();
  }
}

export function savePreferences(storage: PreferencesStorage | null | undefined, preferences: PanelPreferences): void {
  if (!storage) return;

  try {
    storage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        theme: preferences.theme,
        navigationCollapsed: preferences.navigationCollapsed,
        contextPanelWidth: clampContextPanelWidth(preferences.contextPanelWidth),
      }),
    );
  } catch {
    // Browser storage can be unavailable in privacy-restricted contexts.
  }
}