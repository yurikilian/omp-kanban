import type { Metadata } from "next";
import "./globals.css";
import "../styles/typography.css";
import "../styles/shell.css";
import { codeFont, uiFont } from "./fonts";
import { AppShell } from "@/components/layout/app-shell";
import { PreferencesProvider } from "@/components/layout/preferences-provider";

export const metadata: Metadata = {
  title: "OMP Panel",
  description: "Local operations and inspection interface for Oh My Pi sessions, agents, audits and configurations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${uiFont.variable} ${codeFont.variable}`}>
      <body>
        {/*
         * "sessions" is the only area with a real route in this build slice
         * (DESIGN-SYSTEM.md section 5.2); the other four get an explicit
         * unsupported-area route in a later task. Deriving `current` from
         * the active pathname instead of this static default is future
         * work - see T15's known_gaps.
         */}
        <PreferencesProvider>
          <AppShell projectName="OMP Panel" current="sessions">
            {children}
          </AppShell>
        </PreferencesProvider>
      </body>
    </html>
  );
}