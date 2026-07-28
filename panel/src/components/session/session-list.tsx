"use client";

import { useCallback, useEffect, useState } from "react";
import { useListKeyboard } from "@/hooks/use-list-keyboard";
import { useLiveSessions } from "@/hooks/use-live-sessions";
import { partitionPinned, sortSessions, type SessionSortKey, type SessionSortState } from "@/lib/session-query";
import "@/styles/table.css";
import type { SessionSummary } from "@/server/sessions/types";
import { PinControl } from "./pin-control";
import { SessionSort } from "./session-sort";

interface SessionListProps {
  sessions: SessionSummary[];
  sort?: SessionSortState;
  onSortChange?: (sort: SessionSortState) => void;
  /** Defaults to a same-tab navigation to /sessions/<id> when omitted. */
  onOpenSession?: (sessionId: string) => void;
}

const UNAVAILABLE = "Unavailable";

function formatCost(costUsd: number): string {
  return `$${costUsd.toFixed(2)}`;
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toLocaleString("en-US");
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  if (totalSeconds > 0) return `${totalSeconds}s`;
  return `${durationMs}ms`;
}

function formatLastActivity(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function newestFirst(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
}


/** Renders a usage metric, or the literal word "Unavailable" - never 0, blank or an inferred value (E3-S1-AC2). */
function MetricCell({ value, format }: { value: number | null; format: (value: number) => string }) {
  if (value === null) {
    return <span className="text-muted-foreground">{UNAVAILABLE}</span>;
  }
  return <>{format(value)}</>;
}

/**
 * One row per recorded OMP session - title, project, last activity,
 * duration, cost, input/output tokens, agent count and tool-call count.
 * The initial snapshot is newest first. Live updates replace a row in place
 * and newly observed sessions append, keeping a user’s selection, scroll
 */
export function SessionList({ sessions, sort, onSortChange, onOpenSession }: SessionListProps) {
  const [liveSessions, setLiveSessions] = useState(() => newestFirst(sessions));

  useEffect(() => {
    setLiveSessions(newestFirst(sessions));
  }, [sessions]);

  const [uncontrolledSort, setUncontrolledSort] = useState<SessionSortState>({
    key: "lastActivity",
    direction: "descending",
  });
  const activeSort = sort ?? uncontrolledSort;

  const updateSort = useCallback(
    (key: SessionSortKey) => {
      const nextSort: SessionSortState =
        activeSort.key === key
          ? {
              ...activeSort,
              direction: activeSort.direction === "ascending" ? "descending" : "ascending",
            }
          : { key, direction: "descending" as const };

      if (onSortChange) {
        onSortChange(nextSort);
        return;
      }

      setUncontrolledSort(nextSort);
    },
    [activeSort, onSortChange],
  );

  const refreshSession = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      if (!response.ok) return;

      const updatedSession = (await response.json()) as SessionSummary;
      setLiveSessions((currentSessions) => {
        const sessionIndex = currentSessions.findIndex((session) => session.id === sessionId);
        if (sessionIndex === -1) return [...currentSessions, updatedSession];

        const nextSessions = [...currentSessions];
        nextSessions[sessionIndex] = updatedSession;
        return nextSessions;
      });
    } catch {
      return;
    }
  }, []);

  useLiveSessions(refreshSession);

  const [pinnedSessionIds, setPinnedSessionIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/prefs/pins", { cache: "no-store" });
        const data = response?.ok
          ? ((await response.json()) as { pinnedSessionIds?: string[] })
          : { pinnedSessionIds: [] };
        if (!cancelled) setPinnedSessionIds(new Set(data.pinnedSessionIds ?? []));
      } catch {
        if (!cancelled) setPinnedSessionIds(new Set());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Pinning survives a reload and a runtime restart because it is persisted
  // server-side (see pin-store.ts); this optimistic update just avoids
  // waiting on the round-trip before the row visibly moves groups
  // (E3-S4-AC1, E3-S4-AC3), and rolls back if the request fails.
  const togglePin = useCallback(
    (sessionId: string) => {
      const wasPinned = pinnedSessionIds.has(sessionId);
      const nextPinned = !wasPinned;

      setPinnedSessionIds((current) => {
        const next = new Set(current);
        if (nextPinned) next.add(sessionId);
        else next.delete(sessionId);
        return next;
      });

      void (async () => {
        try {
          const response = await fetch("/api/prefs/pins", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, pinned: nextPinned }),
          });
          if (!response?.ok) throw new Error("Failed to update the pinned session");

          const data = (await response.json()) as { pinnedSessionIds: string[] };
          setPinnedSessionIds(new Set(data.pinnedSessionIds));
        } catch {
          setPinnedSessionIds((current) => {
            const reverted = new Set(current);
            if (wasPinned) reverted.add(sessionId);
            else reverted.delete(sessionId);
            return reverted;
          });
        }
      })();
    },
    [pinnedSessionIds],
  );

  const ordered =
    activeSort.key === "lastActivity" && activeSort.direction === "descending"
      ? liveSessions
      : sortSessions(liveSessions, activeSort);

  const { pinned, unpinned } = partitionPinned(ordered, pinnedSessionIds);

  const openSession = useCallback(
    (sessionId: string) => {
      if (onOpenSession) {
        onOpenSession(sessionId);
        return;
      }
      window.location.assign(`/sessions/${encodeURIComponent(sessionId)}`);
    },
    [onOpenSession],
  );

  const displayOrder = [...pinned, ...unpinned];
  const { focusedIndex, getItemProps, containerKeyDownProps } = useListKeyboard<HTMLTableRowElement>(displayOrder.length, (index) => {
    const session = displayOrder[index];
    if (session) openSession(session.id);
  });

  const renderRow = (session: SessionSummary, index: number) => (
    <tr
      key={session.id}
      className="border-b border-border last:border-0 hover:bg-muted/50"
      onClick={() => openSession(session.id)}
      // Inline, not a Tailwind class: this project's vitest config does not
      // run Tailwind's own CSS pipeline, so a utility class here would
      // resolve to nothing under getComputedStyle in a test - see the
      // rendered-geometry-tests skill. A plain inline style is real and
      // testable in both jsdom and the browser (E3-S11-AC1).
      style={focusedIndex === index ? { outline: "2px solid #3b82f6", outlineOffset: "-2px" } : undefined}
      {...getItemProps(index)}
    >
      <td className="px-3 py-2">{session.title}</td>
      <td className="px-3 py-2 text-muted-foreground">{session.project}</td>
      <td className="px-3 py-2 text-muted-foreground">
        <time dateTime={session.lastActivityAt}>{formatLastActivity(session.lastActivityAt)}</time>
      </td>
      <td className="session-list__numeric px-3 py-2">{formatDuration(session.durationMs)}</td>
      <td className="session-list__numeric px-3 py-2">
        <MetricCell value={session.costUsd} format={formatCost} />
      </td>
      <td className="session-list__numeric px-3 py-2">
        <MetricCell value={session.inputTokens} format={formatTokenCount} />
      </td>
      <td className="session-list__numeric px-3 py-2">
        <MetricCell value={session.outputTokens} format={formatTokenCount} />
      </td>
      <td className="session-list__numeric px-3 py-2">{session.agentCount.toLocaleString("en-US")}</td>
      <td className="session-list__numeric px-3 py-2">{session.toolCallCount.toLocaleString("en-US")}</td>
      <td
        className="px-3 py-2 text-right"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <PinControl
          pinned={pinnedSessionIds.has(session.id)}
          sessionTitle={session.title}
          onToggle={() => togglePin(session.id)}
        />
      </td>
    </tr>
  );

  return (
    <>
      <SessionSort onChange={updateSort} sort={activeSort} />
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Recorded OMP sessions</caption>
        <thead>
        <tr className="border-b border-border text-left text-muted-foreground">
          <th scope="col" className="px-3 py-2 font-medium">
            Title
          </th>
          <th scope="col" className="px-3 py-2 font-medium">
            Project
          </th>
          <th scope="col" className="px-3 py-2 font-medium">
            Last activity
          </th>
          <th scope="col" className="session-list__numeric px-3 py-2 font-medium">
            Duration
          </th>
          <th scope="col" className="session-list__numeric px-3 py-2 font-medium">
            Cost
          </th>
          <th scope="col" className="session-list__numeric px-3 py-2 font-medium">
            Input tokens
          </th>
          <th scope="col" className="session-list__numeric px-3 py-2 font-medium">
            Output tokens
          </th>
          <th scope="col" className="session-list__numeric px-3 py-2 font-medium">
            Agents
          </th>
          <th scope="col" className="session-list__numeric px-3 py-2 font-medium">
            Tool calls
          </th>
          <th scope="col" className="px-3 py-2 text-right font-medium">
            <span className="sr-only">Pin</span>
          </th>
        </tr>
      </thead>
      <tbody {...containerKeyDownProps}>
        {pinned.length > 0 && (
          <tr className="border-b border-border">
            <th scope="rowgroup" colSpan={10} className="bg-muted/50 px-3 py-1 text-left text-xs font-medium text-muted-foreground">
              Pinned
            </th>
          </tr>
        )}
        {pinned.map((session, index) => renderRow(session, index))}
        {unpinned.map((session, index) => renderRow(session, index + pinned.length))}
      </tbody>
      </table>
    </>
  );
}