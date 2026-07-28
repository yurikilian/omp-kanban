"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useSessionListUrl } from "@/hooks/use-session-list-url";
import { filterSessionsByQuery } from "@/lib/session-query";
import type { SessionSummary } from "@/server/sessions/types";
import { SessionList } from "./session-list";

interface SessionSearchProps {
  sessions: SessionSummary[];
}

/**
 * Filters `sessions` by a search query typed against title, project and id
 * (E3-S2-AC1), keeping the visible result count in step with the filtered
 * set. A query that matches nothing swaps the table for a no-matches state
 * worded apart from the no-sessions-yet state, with a clear-search action
 * that resets the query and restores the full list (E3-S2-AC2). The query
 * itself lives in the URL (see useSessionListUrl), so a reload restores it
 * and re-applies the same filter (E3-S2-AC3, E3-S2-AC4).
 */
export function SessionSearch({ sessions }: SessionSearchProps) {
  const { query, setQuery } = useSessionListUrl();
  const filtered = useMemo(() => filterSessionsByQuery(sessions, query), [sessions, query]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <input
          type="search"
          aria-label="Search sessions"
          placeholder="Search by title, project or session id"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full max-w-sm rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
        <p className="shrink-0 text-sm text-muted-foreground" aria-live="polite">
          {filtered.length} of {sessions.length} sessions
        </p>
      </div>
      {filtered.length === 0 ? (
        <section role="status" className="rounded-lg border border-dashed border-border px-6 py-8 text-center">
          <h2 className="font-medium text-foreground">No matching sessions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No sessions match &ldquo;{query.trim()}&rdquo;. Try a different title, project or session id.
          </p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => setQuery("")}>
            Clear search
          </Button>
        </section>
      ) : (
        <SessionList sessions={filtered} />
      )}
    </div>
  );
}