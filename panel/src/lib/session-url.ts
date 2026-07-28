/**
 * Gets one usable event identifier from Next's decoded search-param value.
 * Repeated values are ambiguous, so a deep link only selects an event when it
 * names exactly one non-empty identifier.
 */
export function eventIdFromSearchParam(value: string | string[] | null | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/** Creates the canonical deep link for one event in one session. */
export function sessionEventUrl(sessionId: string, eventId: string): string {
  return `/sessions/${encodeURIComponent(sessionId)}?event=${encodeURIComponent(eventId)}`;
}