import type { SessionSummary } from "@/server/sessions/types";

export type SessionSortKey = "cost" | "duration" | "lastActivity";
export type SessionSortDirection = "ascending" | "descending";

export interface SessionSortState {
  key: SessionSortKey;
  direction: SessionSortDirection;
}

/**
 * Returns sessions ordered by the selected key without changing the caller's
 * collection. Missing costs sort below known values for a descending sort and
 * above them for an ascending sort.
 */
export function sortSessions(
  sessions: SessionSummary[],
  { key, direction }: SessionSortState,
): SessionSummary[] {
  const multiplier = direction === "ascending" ? 1 : -1;

  return [...sessions].sort((left, right) => multiplier * (sortValue(left, key) - sortValue(right, key)));
}

function sortValue(session: SessionSummary, key: SessionSortKey): number {
  switch (key) {
    case "cost":
      return session.costUsd ?? Number.NEGATIVE_INFINITY;
    case "duration":
      return session.durationMs;
    case "lastActivity":
      return Date.parse(session.lastActivityAt);
  }
}

export interface SessionFilterState {
  query: string;
  project: string;
  status: string;
}

export function filterSessions(
  sessions: SessionSummary[],
  { query, project, status }: SessionFilterState,
  statusBySessionId: ReadonlyMap<string, string | undefined>,
): SessionSummary[] {
  const needle = query.trim().toLowerCase();

  return sessions.filter(
    (session) =>
      (!needle || sessionMatchesQuery(session, needle)) &&
      (!project || session.project === project) &&
      (!status || statusBySessionId.get(session.id) === status),
  );
}

/**
 * Keeps only the sessions whose title, project or id contains `query` as a
 * case-insensitive substring (E3-S2-AC1). An empty or whitespace-only query
 * matches every session, and a query matching nothing yields an empty array
 * rather than throwing (E3-S2-AC2) - callers render the no-matches state.
 */
export function filterSessionsByQuery(sessions: SessionSummary[], query: string): SessionSummary[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return sessions;

  return sessions.filter((session) => sessionMatchesQuery(session, needle));
}

function sessionMatchesQuery(session: SessionSummary, needle: string): boolean {
  return (
    session.title.toLowerCase().includes(needle) ||
    session.project.toLowerCase().includes(needle) ||
    session.id.toLowerCase().includes(needle)
  );
}