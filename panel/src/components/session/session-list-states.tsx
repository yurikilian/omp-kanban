"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SessionSummary } from "@/server/sessions/types";
import { SessionList } from "./session-list";

type SessionListState =
  | { status: "loading" }
  | { status: "ready"; sessions: SessionSummary[] }
  | { status: "error"; message: string };

function errorMessageFromResponseBody(body: unknown, status: number): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string" &&
    body.error
  ) {
    return body.error;
  }

  return `The sessions request failed with status ${status}.`;
}


export function SessionListStates() {
  const [state, setState] = useState<SessionListState>({ status: "loading" });

  const loadSessions = useCallback(async () => {
    setState({ status: "loading" });

    try {
      const response = await fetch("/api/sessions", { cache: "no-store" });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => undefined);
        setState({
          status: "error",
          message: errorMessageFromResponseBody(body, response.status),
        });
        return;
      }

      setState({
        status: "ready",
        sessions: (await response.json()) as SessionSummary[],
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error && error.message ? error.message : "The sessions request failed.",
      });
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  if (state.status === "loading") {
    return (
      <section role="status" aria-live="polite" className="rounded-lg border border-border px-6 py-8 text-center">
        Loading sessions
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 px-6 py-8 text-center">
        <h2 className="font-medium text-foreground">Could not load sessions</h2>
        <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
        <p className="mt-3 text-sm text-muted-foreground">No previously loaded session data is available.</p>
        <Button type="button" variant="outline" className="mt-4" onClick={loadSessions}>
          Retry
        </Button>
      </section>
    );
  }

  if (state.sessions.length === 0) {
    return (
      <section role="status" className="rounded-lg border border-dashed border-border px-6 py-8 text-center">
        <h2 className="font-medium text-foreground">No recorded sessions</h2>
        <p className="mt-1 text-sm text-muted-foreground">Start an Oh My Pi session to see it here.</p>
      </section>
    );
  }

  return <SessionList sessions={state.sessions} />;
}
