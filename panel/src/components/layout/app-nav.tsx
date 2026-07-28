"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePreferences } from "@/components/layout/preferences-provider";
import {
  Activity,
  Bot,
  ChevronsLeft,
  ChevronsRight,
  MessagesSquare,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavArea {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

/** DESIGN-SYSTEM.md section 5.2 - the five primary sections, in order. */
export const NAV_AREAS: NavArea[] = [
  { key: "sessions", label: "Sessions", href: "/sessions", icon: MessagesSquare },
  { key: "agents", label: "Agents", href: "/agents", icon: Bot },
  { key: "observability", label: "Observability", href: "/observability", icon: Activity },
  { key: "audits", label: "Audits", href: "/audits", icon: ShieldCheck },
  { key: "configurations", label: "Configurations", href: "/configurations", icon: Settings },
];

export interface AppNavProps {
  /** Key from NAV_AREAS marking the section the panel is currently showing. */
  current: string;
}

/**
 * DESIGN-SYSTEM.md section 5.2 ("Application Navigation"). Width resolves to
 * 208px expanded / 64px collapsed via src/styles/shell.css's
 * `[data-collapsed]` selector - never `auto` (E2-S2-AC2).
 *
 * The collapse/expand width transition is suppressed when the user has
 * `prefers-reduced-motion: reduce` set (E2-S2-AC6). jsdom's computed-style
 * resolver never evaluates `@media` conditions, so - mirroring how
 * src/lib/theme.ts surfaces the color-scheme preference as a `.dark` class
 * instead of `@media (prefers-color-scheme)` - the preference is read via
 * `matchMedia` and surfaced as `data-reduced-motion`, which
 * src/styles/shell.css keys off the same way it keys off `data-collapsed`.
 */
export function AppNav({ current }: AppNavProps) {
  const { preferences, setNavigationCollapsed } = usePreferences();
  const { navigationCollapsed: collapsed } = preferences;
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <nav
      className="app-nav"
      aria-label="Application"
      data-collapsed={collapsed}
      data-reduced-motion={reducedMotion}
    >
      <button
        type="button"
        className="app-nav__toggle"
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        onClick={() => setNavigationCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronsRight className="app-nav__icon" aria-hidden="true" />
        ) : (
          <ChevronsLeft className="app-nav__icon" aria-hidden="true" />
        )}
      </button>
      <ul className="app-nav__list">
        {NAV_AREAS.map((area) => {
          const Icon = area.icon;
          const isCurrent = area.key === current;
          return (
            <li key={area.key}>
              {/*
               * Sessions is the only area with a real route in this build
               * slice (T21 adds the other four); viewport-triggered
               * prefetch against nonexistent routes is wasted work and, in
               * a production build, kept the network busy long enough to
               * hang Playwright's networkidle wait in e2e/same-origin-assets.spec.ts.
               */}
              <Link
                href={area.href}
                prefetch={false}
                className="app-nav__link"
                aria-current={isCurrent ? "page" : undefined}
              >
                <Icon className="app-nav__icon" aria-hidden="true" />
                <span className="app-nav__label">{area.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}