import type { ReactNode } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { ContextPanel } from "@/components/layout/context-panel";
import { GlobalBar } from "@/components/layout/global-bar";

export interface AppShellProps {
  /** DESIGN-SYSTEM.md section 5.1 - shown in the global bar. */
  projectName: string;
  /** Key from app-nav's NAV_AREAS marking the section currently shown. */
  current: string;
  /** Main-workspace content (DESIGN-SYSTEM.md section 5.4). */
  children: ReactNode;
}

/**
 * DESIGN-SYSTEM.md section 5 ("Main Application Shell"): a global bar on top
 * of a body of application navigation, context panel and main workspace
 * (E2-S2-AC1). GlobalBar and AppNav are interactive Client Components;
 * AppShell itself stays a Server Component so it can be rendered directly
 * from the root layout.
 */
export function AppShell({ projectName, current, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <GlobalBar projectName={projectName} />
      <div className="app-shell__body">
        <AppNav current={current} />
        <ContextPanel />
        <main className="app-shell__main">{children}</main>
      </div>
    </div>
  );
}
