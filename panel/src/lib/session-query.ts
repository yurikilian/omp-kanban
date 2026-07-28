import type { SessionSummary } from "@/server/sessions/types";

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
