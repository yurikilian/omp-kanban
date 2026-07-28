"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  type PanelPreferences,
  type PreferencesStorage,
  getDefaultPreferences,
  loadPreferences,
  savePreferences,
} from "@/lib/preferences";
import { clampContextPanelWidth } from "@/lib/panel-size";
import { applyTheme, type Theme } from "@/lib/theme";

interface PreferencesContextValue {
  preferences: PanelPreferences;
  setTheme: (theme: Theme) => void;
  setNavigationCollapsed: (collapsed: boolean) => void;
  setContextPanelWidth: (width: number) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function browserStorage(): PreferencesStorage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(getDefaultPreferences);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    setPreferences(loadPreferences(browserStorage(), window.innerWidth));
    setRestored(true);
  }, []);

  useEffect(() => {
    applyTheme(preferences.theme);
  }, [preferences.theme]);

  useEffect(() => {
    if (restored) savePreferences(browserStorage(), preferences);
  }, [preferences, restored]);

  const setTheme = useCallback((theme: Theme) => {
    setPreferences((current) => ({ ...current, theme }));
  }, []);

  const setNavigationCollapsed = useCallback((navigationCollapsed: boolean) => {
    setPreferences((current) => ({ ...current, navigationCollapsed }));
  }, []);

  const setContextPanelWidth = useCallback((contextPanelWidth: number) => {
    setPreferences((current) => ({
      ...current,
      contextPanelWidth: clampContextPanelWidth(contextPanelWidth),
    }));
  }, []);

  const value = useMemo(
    () => ({ preferences, setTheme, setNavigationCollapsed, setContextPanelWidth }),
    [preferences, setContextPanelWidth, setNavigationCollapsed, setTheme],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("usePreferences must be used within PreferencesProvider");
  return context;
}