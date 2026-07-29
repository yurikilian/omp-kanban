"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { DelegationEvent } from "@/components/events/delegation-event";
import { ErrorEvent } from "@/components/events/error-event";
import { PromptEvent } from "@/components/events/prompt-event";
import { ResponseEvent } from "@/components/events/response-event";
import { StatusEvent } from "@/components/events/status-event";
import { ToolCallEvent } from "@/components/events/tool-call-event";
import { useWindowedEvents } from "@/hooks/use-windowed-events";
import { useTimelineKeyboard } from "@/hooks/use-timeline-keyboard";
import { agentIdFromSearchParam, eventIdFromSearchParam, SESSION_URL_CHANGE_EVENT, sessionEventUrl } from "@/lib/session-url";
import { LiveRegion } from "@/components/layout/live-region";
import { MissingEventNotice } from "./missing-event-notice";
import { ReturnToLive } from "./return-to-live";
import { useFollowLive } from "@/hooks/use-follow-live";
import type { TimelineEvent } from "@/server/sessions/timeline";

export interface EventStreamProps {
  sessionId: string;
}

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; events: TimelineEvent[] };

const TIMELINE_REFRESH_INTERVAL_MS = 2_000;

/**
 * Dispatches one merged-transcript event to its own visual treatment
 * through the shared `EventFrame` - prompt and response in a bounded
 * reading column, a tool call collapsed to one line, a delegation's
 * parent-to-child hand-off, a status separator, and an error - so every
 * type keeps its own identity rather than reading as identical cards
 * (E3-S7-AC1).
 */
function renderEvent(event: TimelineEvent, expanded: boolean): ReactNode {
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
          input={event.input}
          output={event.output}
          durationMs={event.durationMs}
          outcome={event.outcome}
          expanded={expanded}
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

function eventsForAgentBranch(events: TimelineEvent[], agentId: string | undefined): TimelineEvent[] {
  if (!agentId) return events;

  const branch = new Set([agentId]);
  for (const event of events) {
    if (event.type === "delegation" && branch.has(event.parentAgent)) branch.add(event.childAgent);
  }

  return events.filter((event) => {
    switch (event.type) {
      case "response":
      case "tool_call":
      case "error":
        return branch.has(event.agent);
      case "delegation":
        return branch.has(event.parentAgent) || branch.has(event.childAgent);
      case "prompt":
      case "status":
        return false;
    }
  });
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
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return agentIdFromSearchParam(new URLSearchParams(window.location.search).get("agent"));
  });
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;

    const loadTimeline = (initialLoad: boolean) => {
      fetch(`/api/sessions/${sessionId}/timeline`)
        .then((response) => {
          if (!response.ok) throw new Error(`Failed to load timeline: ${response.status}`);
          return response.json() as Promise<TimelineEvent[]>;
        })
        .then((events) => {
          if (!cancelled) setState({ status: "ready", events });
        })
        .catch(() => {
          if (!cancelled && initialLoad) setState({ status: "error" });
        });
    };

    setState({ status: "loading" });
    loadTimeline(true);
    const refreshTimer = window.setInterval(() => loadTimeline(false), TIMELINE_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [sessionId]);

  useEffect(() => {
    const updateSelection = () => {
      setSelectedAgentId(agentIdFromSearchParam(new URLSearchParams(window.location.search).get("agent")));
    };

    window.addEventListener("popstate", updateSelection);
    window.addEventListener(SESSION_URL_CHANGE_EVENT, updateSelection);
    return () => {
      window.removeEventListener("popstate", updateSelection);
      window.removeEventListener(SESSION_URL_CHANGE_EVENT, updateSelection);
    };
  }, []);

  // Windowing needs an events array on every render regardless of load
  // state, so hooks stay unconditional; an empty array windows to nothing.
  const events = state.status === "ready" ? state.events : [];
  const visibleEvents = useMemo(() => eventsForAgentBranch(events, selectedAgentId), [events, selectedAgentId]);
  const { containerRef, items, totalSize, measureElement } = useWindowedEvents(visibleEvents);
  const liveAnchorRef = useRef<HTMLDivElement>(null);
  const { isFollowing, returnToLive } = useFollowLive({
    eventCount: visibleEvents.length,
    timelineRef: containerRef,
    liveAnchorRef,
  });
  const selectedEvent = useMemo(
    () => visibleEvents.find((event) => event.id === selectedEventId),
    [selectedEventId, visibleEvents],
  );

  const selectEvent = useCallback(
    (eventId: string) => {
      setSelectedEventId(eventId);
      window.history.replaceState(window.history.state, "", sessionEventUrl(sessionId, eventId, selectedAgentId));
    },
    [sessionId, selectedAgentId],
  );

  const clearSelectedEvent = useCallback(() => {
    setSelectedEventId(undefined);
    const params = new URLSearchParams(window.location.search);
    params.delete("event");
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);

  const toggleExpanded = useCallback((eventId: string) => {
    setExpandedEventIds((current) => {
      const next = new Set(current);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  // Only the ids in view can ever be a valid keyboard cursor position - the
  // hook itself drops the cursor if the agent-branch filter narrows past it.
  const eventIds = useMemo(() => visibleEvents.map((event) => event.id), [visibleEvents]);
  const { focusedEventId, containerKeyDownProps } = useTimelineKeyboard({
    eventIds,
    onExpand: toggleExpanded,
    onOpenInspector: selectEvent,
    onClear: clearSelectedEvent,
  });

  // The cursor moves without ever moving real DOM focus off the timeline
  // container (see the outline-only indicator below), so a screen reader
  // has nothing else to announce the move by - an explicit live region
  // speaks each new cursor position without stealing focus (E3-S11-AC4).
  const cursorAnnouncement = useMemo(() => {
    if (focusedEventId === undefined) return "";

    const index = eventIds.indexOf(focusedEventId);
    const focusedEvent = visibleEvents[index];
    if (index < 0 || !focusedEvent) return "";

    return `Event ${index + 1} of ${eventIds.length}: ${eventInspectorText(focusedEvent)}`;
  }, [eventIds, focusedEventId, visibleEvents]);

  useEffect(() => {
    if (state.status !== "ready" || !selectedEvent) return;

    const eventElementId = `session-event-${selectedEvent.id}`;
    const selectedElement = document.getElementById(eventElementId);
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: "center" });
      return;
    }

    const eventIndex = visibleEvents.indexOf(selectedEvent);
    const containerTop = containerRef.current?.getBoundingClientRect().top;
    if (eventIndex < 0 || containerTop === undefined) return;

    // This is the same initial row-height estimate used by the windowed
    // timeline; the animation-frame retry runs after virtualization mounts it.
    window.scrollTo({ top: Math.max(0, containerTop + window.scrollY + eventIndex * 88 - window.innerHeight / 2) });
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(eventElementId)?.scrollIntoView({ block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [containerRef, selectedEvent, state.status, visibleEvents]);

  // The keyboard cursor can land on an event outside the virtualized
  // window, same as a deep-linked selection above - bring it on-screen
  // without stealing focus from the container the cursor actually lives on.
  useEffect(() => {
    if (focusedEventId === undefined) return;

    const eventElementId = `session-event-${focusedEventId}`;
    const focusedElement = document.getElementById(eventElementId);
    if (focusedElement) {
      focusedElement.scrollIntoView({ block: "nearest" });
      return;
    }

    const eventIndex = eventIds.indexOf(focusedEventId);
    const containerTop = containerRef.current?.getBoundingClientRect().top;
    if (eventIndex < 0 || containerTop === undefined) return;

    window.scrollTo({ top: Math.max(0, containerTop + window.scrollY + eventIndex * 88 - window.innerHeight / 2) });
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(eventElementId)?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [containerRef, eventIds, focusedEventId]);

  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading timeline…</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-muted-foreground">Failed to load the session timeline.</p>;
  }
  if (visibleEvents.length === 0) {
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
      <LiveRegion message={cursorAnnouncement} />
      {selectedEvent && (
        <aside data-slot="event-inspector" aria-label="Selected event" className="rounded-md border p-3 text-sm">
          <h2 className="font-medium">Event inspector</h2>
          <p>Event: {selectedEvent.id}</p>
          <p>Type: {selectedEvent.type}</p>
          <p>{eventInspectorText(selectedEvent)}</p>
        </aside>
      )}
      <ReturnToLive isVisible={!isFollowing} onReturn={returnToLive} />
      <div
        data-slot="event-stream"
        ref={containerRef}
        tabIndex={0}
        aria-label="Session event timeline"
        style={{ position: "relative", height: totalSize }}
        {...containerKeyDownProps}
      >
        {items.map(({ event, virtualItem }) => (
          <div
            key={event.id}
            id={`session-event-${event.id}`}
            data-event-id={event.id}
            data-index={virtualItem.index}
            ref={measureElement}
            className="cursor-pointer pb-1"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualItem.start}px)`,
              ...(focusedEventId === event.id ? { outline: "2px solid #3b82f6", outlineOffset: "-2px" } : {}),
            }}
            role="button"
            tabIndex={0}
            aria-pressed={selectedEventId === event.id}
            aria-expanded={expandedEventIds.has(event.id)}
            onClick={() => selectEvent(event.id)}
            onKeyDown={(keyboardEvent) => {
              if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                keyboardEvent.preventDefault();
                selectEvent(event.id);
              }
            }}
          >
            {renderEvent(event, expandedEventIds.has(event.id))}
          </div>
        ))}
        <div
          ref={liveAnchorRef}
          aria-hidden="true"
          style={{ position: "absolute", top: totalSize, width: 1, height: 1 }}
        />
      </div>
    </>
  );
}