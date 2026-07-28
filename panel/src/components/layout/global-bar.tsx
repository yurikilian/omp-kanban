"use client";

import { Moon, Sun } from "lucide-react";
import { usePreferences } from "@/components/layout/preferences-provider";

export interface GlobalBarProps {
  /** DESIGN-SYSTEM.md section 5.1 - the project the panel is inspecting. */
  projectName: string;
}

/**
 * DESIGN-SYSTEM.md section 5.1 ("Global Bar"). Only the project name and the
 * theme switch are in scope for E2-S2-AC1; daemon/connection status, global
 * search, the command palette trigger and the runtime indicator belong to
 * later tasks.
 */
export function GlobalBar({ projectName }: GlobalBarProps) {
  const { preferences, setTheme } = usePreferences();
  const { theme } = preferences;

  return (
    <header className="global-bar">
      <span className="global-bar__project">{projectName}</span>
      <button
        type="button"
        className="global-bar__theme-toggle"
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      </button>
    </header>
  );
}