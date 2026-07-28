"use client";

import { useCallback, useEffect, useState } from "react";
import { useLiveSessions } from "@/hooks/use-live-sessions";
import type { SessionSummary } from "@/server/sessions/types";

interface SessionListProps {
  sessions: SessionSummary[];
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

/** Renders a usage metric, or the literal word "Unavailable" - never 0, blank or an inferred value (E3-S1-AC2). */
function MetricCell({ value, format }: { value: number | null; format: (value: number) => string }) {
  if (value === null) {
    return <span className="text-muted-foreground">{UNAVAILABLE}</span>;
  }
  return <>{format(value)}</>;
}

/**
 * One row per recorded OMP session - title, project, last activity,
 * duration, cost, input/output tokens, agent count and tool-call count -
 * ordered newest first by last activity (E3-S1-AC1). Sorts its own input
 * rather than trusting the caller's order, so it stays correct even fed a
 * set assembled from multiple sources (e.g. a future live update).
 */
export function SessionList({ sessions }: SessionListProps) {
  const [liveSessions, setLiveSessions] = useState(sessions);

  useEffect(() => {
    setLiveSessions(sessions);
  }, [sessions]);

  const refreshSession = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      if (!response.ok) return;

      const updatedSession = (await response.json()) as SessionSummary;
      setLiveSessions((currentSessions) =>
        currentSessions.map((session) => (session.id === sessionId ? updatedSession : session)),
      );
    } catch {
      return;
    }
  }, []);

  useLiveSessions(refreshSession);

  const ordered = [...liveSessions].sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));

  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">Recorded OMP sessions, newest first</caption>
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
          <th scope="col" className="px-3 py-2 text-right font-medium">
            Duration
          </th>
          <th scope="col" className="px-3 py-2 text-right font-medium">
            Cost
          </th>
          <th scope="col" className="px-3 py-2 text-right font-medium">
            Input tokens
          </th>
          <th scope="col" className="px-3 py-2 text-right font-medium">
            Output tokens
          </th>
          <th scope="col" className="px-3 py-2 text-right font-medium">
            Agents
          </th>
          <th scope="col" className="px-3 py-2 text-right font-medium">
            Tool calls
          </th>
        </tr>
      </thead>
      <tbody>
        {ordered.map((session) => (
          <tr key={session.id} className="border-b border-border last:border-0 hover:bg-muted/50">
            <td className="px-3 py-2">{session.title}</td>
            <td className="px-3 py-2 text-muted-foreground">{session.project}</td>
            <td className="px-3 py-2 text-muted-foreground">
              <time dateTime={session.lastActivityAt}>{formatLastActivity(session.lastActivityAt)}</time>
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{formatDuration(session.durationMs)}</td>
            <td className="px-3 py-2 text-right tabular-nums">
              <MetricCell value={session.costUsd} format={formatCost} />
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              <MetricCell value={session.inputTokens} format={formatTokenCount} />
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              <MetricCell value={session.outputTokens} format={formatTokenCount} />
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{session.agentCount.toLocaleString("en-US")}</td>
            <td className="px-3 py-2 text-right tabular-nums">{session.toolCallCount.toLocaleString("en-US")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}