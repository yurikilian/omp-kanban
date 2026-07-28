"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";

const QUERY_PARAM = "q";

export interface SessionListUrlState {
  query: string;
  setQuery: (next: string) => void;
}

/**
 * Makes the URL the source of truth for the session list's search query
 * (E3-S2-AC3, E3-S2-AC4): the initial value comes from the `q` search
 * param, and every change is written straight back with
 * history.replaceState - no navigation, no new history entry - so a
 * reload restores the same query (E3-S2-AC3) and a remount triggered by a
 * server refresh (the list re-fetching and swapping the search UI back
 * in) reads the same value back out of the URL instead of resetting to
 * blank (E3-S2-AC4).
 *
 * useSearchParams() doubles as a check for whether a Next.js App Router
 * context is actually mounted: it returns null outside one (e.g. in
 * component tests that render SessionSearch bare, with no router
 * provider). Without a router present this hook falls back to plain
 * component state and never touches the URL, so those tests see exactly
 * the pre-URL-aware behaviour.
 */
export function useSessionListUrl(): SessionListUrlState {
  const searchParams = useSearchParams();
  const hasRouter = searchParams !== null;

  const [query, setQueryState] = useState<string>(() => (hasRouter ? (searchParams.get(QUERY_PARAM) ?? "") : ""));

  const setQuery = useCallback(
    (next: string) => {
      setQueryState(next);
      if (!hasRouter) return;

      const params = new URLSearchParams(window.location.search);
      if (next) {
        params.set(QUERY_PARAM, next);
      } else {
        params.delete(QUERY_PARAM);
      }
      const search = params.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
    },
    [hasRouter],
  );

  return { query, setQuery };
}