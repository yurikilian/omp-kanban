"use client";

import { useEffect, useState } from "react";
import type { SessionSummary } from "@/server/sessions/types";
import { SessionList } from "./session-list";

export function SessionListStates() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);

  useEffect(() => {
    void fetch("/api/sessions", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        setSessions((await response.json()) as SessionSummary[]);
      })
      .catch(() => {});
  }, []);

  if (sessions === null) {
    return (
      <section role="status" aria-live="polite" className="rounded-lg border border-border px-6 py-8 text-center">
        Loading sessions
      </section>
    );
  }

  if (sessions.length === 0) {
    return (
      <section role="status" className="rounded-lg border border-dashed border-border px-6 py-8 text-center">
        <h2 className="font-medium text-foreground">No recorded sessions</h2>
        <p className="mt-1 text-sm text-muted-foreground">Start an Oh My Pi session to see it here.</p>
      </section>
    );
  }

  return <SessionList sessions={sessions} />;
}
