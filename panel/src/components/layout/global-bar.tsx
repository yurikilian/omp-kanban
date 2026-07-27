"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getTheme, toggleTheme, type Theme } from "@/lib/theme";

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
  // Server-rendered markup has no document to read, so this starts "light"
  // and syncs to the real value (set by src/lib/theme.ts) once mounted.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(getTheme());
  }, []);

  return (
    <header className="global-bar">
      <span className="global-bar__project">{projectName}</span>
      <button
        type="button"
        className="global-bar__theme-toggle"
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        onClick={() => setTheme(toggleTheme())}
      >
        {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      </button>
    </header>
  );
}
