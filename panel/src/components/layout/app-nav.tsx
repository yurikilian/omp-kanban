"use client";

import Link from "next/link";
import { useState } from "react";
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
 * `[data-collapsed]` selector - never `auto` (E2-S2-AC2). Persisting the
 * expanded state locally is out of scope here (see T30).
 */
export function AppNav({ current }: AppNavProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav className="app-nav" aria-label="Application" data-collapsed={collapsed}>
      <button
        type="button"
        className="app-nav__toggle"
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        onClick={() => setCollapsed((value) => !value)}
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
