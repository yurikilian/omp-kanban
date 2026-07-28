"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { DelegationEvent } from "@/components/events/delegation-event";
import { ErrorEvent } from "@/components/events/error-event";
import { PromptEvent } from "@/components/events/prompt-event";
import { ResponseEvent } from "@/components/events/response-event";
import { StatusEvent } from "@/components/events/status-event";
import { ToolCallEvent } from "@/components/events/tool-call-event";
import { useWindowedEvents } from "@/hooks/use-windowed-events";
import { sessionEventUrl, eventIdFromSearchParam } from "@/lib/session-url";
import { MissingEventNotice } from "./missing-event-notice";
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

function eventInspectorText(event: TimelineEvent): string {
  switch (event.type) {
    case "prompt":
    case "response":
    case "error":
      return event.text;
    case "tool_call":
      return event.summary ?? event.toolName;
    case "delegation":
      return event.task ?? `${event.parentAgent} delegated to ${event.childAgent}`;
    case "status":
      return event.label;
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
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return eventIdFromSearchParam(new URLSearchParams(window.location.search).get("event"));
  });
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

  // Windowing needs an events array on every render regardless of load
  // state, so hooks stay unconditional; an empty array windows to nothing.
  const events = state.status === "ready" ? state.events : [];
  const { containerRef, items, totalSize, measureElement } = useWindowedEvents(events);
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId),
    [events, selectedEventId],
  );

  useEffect(() => {
    if (state.status !== "ready" || !selectedEvent) return;

    const eventElementId = `session-event-${selectedEvent.id}`;
    const selectedElement = document.getElementById(eventElementId);
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: "center" });
      return;
    }

    const eventIndex = events.indexOf(selectedEvent);
    const containerTop = containerRef.current?.getBoundingClientRect().top;
    if (eventIndex < 0 || containerTop === undefined) return;

    // This is the same initial row-height estimate used by the windowed
    // timeline; the animation-frame retry runs after virtualization mounts it.
    window.scrollTo({ top: Math.max(0, containerTop + window.scrollY + eventIndex * 88 - window.innerHeight / 2) });
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(eventElementId)?.scrollIntoView({ block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [containerRef, events, selectedEvent, state.status]);

  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading timeline…</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-muted-foreground">Failed to load the session timeline.</p>;
  }
  if (events.length === 0) {
    return (
      <>
        {selectedEventId && <MissingEventNotice eventId={selectedEventId} />}
        <p className="text-sm text-muted-foreground">No events recorded for this session.</p>
      </>
    );
  }

  return (
    <>
      {selectedEventId && !selectedEvent && <MissingEventNotice eventId={selectedEventId} />}
      {selectedEvent && (
        <aside data-slot="event-inspector" aria-label="Selected event" className="rounded-md border p-3 text-sm">
          <h2 className="font-medium">Event inspector</h2>
          <p>Event: {selectedEvent.id}</p>
          <p>Type: {selectedEvent.type}</p>
          <p>{eventInspectorText(selectedEvent)}</p>
        </aside>
      )}
      <div data-slot="event-stream" ref={containerRef} style={{ position: "relative", height: totalSize }}>
        {items.map(({ event, virtualItem }) => (
          <div
            key={event.id}
            id={`session-event-${event.id}`}
            data-event-id={event.id}
            data-index={virtualItem.index}
            ref={measureElement}
            className="cursor-pointer pb-1"
            style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualItem.start}px)` }}
            role="button"
            tabIndex={0}
            aria-pressed={selectedEventId === event.id}
            onClick={() => {
              setSelectedEventId(event.id);
              window.history.replaceState(window.history.state, "", sessionEventUrl(sessionId, event.id));
            }}
            onKeyDown={(keyboardEvent) => {
              if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                keyboardEvent.preventDefault();
                setSelectedEventId(event.id);
                window.history.replaceState(window.history.state, "", sessionEventUrl(sessionId, event.id));
              }
            }}
          >
            {renderEvent(event)}
          </div>
        ))}
      </div>
    </>
  );
}