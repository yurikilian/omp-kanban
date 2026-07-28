"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { DelegationEvent } from "@/components/events/delegation-event";
import { ErrorEvent } from "@/components/events/error-event";
import { PromptEvent } from "@/components/events/prompt-event";
import { ResponseEvent } from "@/components/events/response-event";
import { StatusEvent } from "@/components/events/status-event";
import { ToolCallEvent } from "@/components/events/tool-call-event";
import type { TimelineEvent } from "@/server/sessions/timeline";

export interface EventStreamProps {
  sessionId: string;
}

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; events: TimelineEvent[] };

/**
 * Dispatches one merged-transcript event to its own visual treatment
 * through the shared `EventFrame` - prompt and response in a bounded
 * reading column, a tool call collapsed to one line, a delegation's
 * parent-to-child hand-off, a status separator, and an error - so every
 * type keeps its own identity rather than reading as identical cards
 * (E3-S7-AC1).
 */
function renderEvent(event: TimelineEvent): ReactNode {
  switch (event.type) {
    case "prompt":
      return <PromptEvent key={event.id} timestamp={event.timestamp} text={event.text} />;
    case "response":
      return (
        <ResponseEvent
          key={event.id}
          agent={event.agent}
          timestamp={event.timestamp}
          text={event.text}
          model={event.model}
          durationMs={event.durationMs}
          inputTokens={event.inputTokens}
          outputTokens={event.outputTokens}
          costUsd={event.costUsd}
        />
      );
    case "tool_call":
      return (
        <ToolCallEvent
          key={event.id}
          agent={event.agent}
          timestamp={event.timestamp}
          toolName={event.toolName}
          summary={event.summary}
          durationMs={event.durationMs}
          outcome={event.outcome}
        />
      );
    case "delegation":
      return (
        <DelegationEvent
          key={event.id}
          timestamp={event.timestamp}
          parentAgent={event.parentAgent}
          childAgent={event.childAgent}
          task={event.task}
        />
      );
    case "status":
      return <StatusEvent key={event.id} timestamp={event.timestamp} label={event.label} />;
    case "error":
      return <ErrorEvent key={event.id} timestamp={event.timestamp} agent={event.agent} text={event.text} />;
  }
}

/**
 * Loads and renders one session's merged main and sub-agent timeline.
 * Fetches its own data (rather than receiving it as a prop) because the
 * timeline is the one part of the panel that can carry thousands of
 * events (E3-S7-AC5) and needs its own client-side data lifecycle to ever
 * window or virtualize that - a plain server-rendered prop would commit
 * the whole page to eagerly rendering everything up front.
 */
export function EventStream({ sessionId }: EventStreamProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    fetch(`/api/sessions/${sessionId}/timeline`)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load timeline: ${response.status}`);
        return response.json() as Promise<TimelineEvent[]>;
      })
      .then((events) => {
        if (!cancelled) setState({ status: "ready", events });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading timeline…</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-muted-foreground">Failed to load the session timeline.</p>;
  }
  if (state.events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events recorded for this session.</p>;
  }

  return (
    <div data-slot="event-stream" className="flex flex-col gap-1">
      {state.events.map(renderEvent)}
    </div>
  );
}