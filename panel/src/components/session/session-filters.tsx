"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { filterSessions, type SessionFilterState, type SessionSortState } from "@/lib/session-query";
import type { SessionSummary } from "@/server/sessions/types";
import { SessionList } from "./session-list";

interface SessionFiltersProps {
  sessions: SessionSummary[];
}

interface SessionListUrlState extends SessionFilterState {
  sort: SessionSortState;
}

const DEFAULT_SORT: SessionSortState = { key: "lastActivity", direction: "descending" };
const STATUS_OPTIONS = ["Completed", "Failed", "Interrupted", "Running", "Unknown"];

function readSessionListUrl(): SessionListUrlState {
  if (typeof window === "undefined") {
    return { query: "", project: "", status: "", sort: DEFAULT_SORT };
  }

  const params = new URLSearchParams(window.location.search);
  const key = params.get("sort");
  const direction = params.get("direction");

  return {
    query: params.get("q") ?? "",
    project: params.get("project") ?? "",
    status: params.get("status") ?? "",
    sort: {
      key: key === "cost" || key === "duration" || key === "lastActivity" ? key : DEFAULT_SORT.key,
      direction: direction === "ascending" || direction === "descending" ? direction : DEFAULT_SORT.direction,
    },
  };
}

function sessionStatusLabel(detail: unknown): string | undefined {
  if (
    typeof detail === "object" &&
    detail !== null &&
    "status" in detail &&
    typeof detail.status === "object" &&
    detail.status !== null &&
    "label" in detail.status &&
    typeof detail.status.label === "string"
  ) {
    return detail.status.label;
  }
}

export function SessionFilters({ sessions }: SessionFiltersProps) {
  const [filters, setFilters] = useState<SessionListUrlState>(readSessionListUrl);
  const [statusBySessionId, setStatusBySessionId] = useState<ReadonlyMap<string, string | undefined>>(
    () => new Map(),
  );

  useEffect(() => {
    let cancelled = false;

    void Promise.all(
      sessions.map(async (session) => {
        const response = await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, { cache: "no-store" });
        if (!response.ok) return [session.id, undefined] as const;
        return [session.id, sessionStatusLabel(await response.json())] as const;
      }),
    )
      .then((statuses) => {
        if (!cancelled) setStatusBySessionId(new Map(statuses));
      })
      .catch(() => {
        if (!cancelled) setStatusBySessionId(new Map());
      });

    return () => {
      cancelled = true;
    };
  }, [sessions]);

  const updateFilters = useCallback((next: SessionListUrlState) => {
    setFilters(next);

    const params = new URLSearchParams();
    if (next.query) params.set("q", next.query);
    if (next.project) params.set("project", next.project);
    if (next.status) params.set("status", next.status);
    params.set("sort", next.sort.key);
    params.set("direction", next.sort.direction);

    const search = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${search}`);
  }, []);

  const visibleSessions = useMemo(
    () => filterSessions(sessions, filters, statusBySessionId),
    [filters, sessions, statusBySessionId],
  );
  const projects = useMemo(() => [...new Set(sessions.map((session) => session.project))].sort(), [sessions]);

  const clearFilters = () => {
    updateFilters({ query: "", project: "", status: "", sort: filters.sort });
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <label className="grid gap-1 text-sm text-muted-foreground">
          Search sessions
          <input
            type="search"
            aria-label="Search sessions"
            placeholder="Search by title, project or session id"
            value={filters.query}
            onChange={(event) => updateFilters({ ...filters, query: event.target.value })}
            className="w-full max-w-sm rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </label>
        <label className="grid gap-1 text-sm text-muted-foreground">
          Project
          <select
            aria-label="Project"
            value={filters.project}
            onChange={(event) => updateFilters({ ...filters, project: event.target.value })}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm dark:bg-input/30"
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project} value={project}>
                {project}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-muted-foreground">
          Status
          <select
            aria-label="Status"
            value={filters.status}
            onChange={(event) => updateFilters({ ...filters, status: event.target.value })}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm dark:bg-input/30"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <p className="shrink-0 text-sm text-muted-foreground" aria-live="polite">
          {visibleSessions.length} of {sessions.length} sessions
        </p>
      </div>
      {visibleSessions.length === 0 ? (
        <section role="status" className="rounded-lg border border-dashed border-border px-6 py-8 text-center">
          <h2 className="font-medium text-foreground">No matching sessions</h2>
          <p className="mt-1 text-sm text-muted-foreground">Try changing or clearing the active filters.</p>
          <Button type="button" variant="outline" className="mt-4" onClick={clearFilters}>
            Clear filters
          </Button>
        </section>
      ) : (
        <SessionList
          sessions={visibleSessions}
          sort={filters.sort}
          onSortChange={(sort) => updateFilters({ ...filters, sort })}
        />
      )}
    </div>
  );
}
