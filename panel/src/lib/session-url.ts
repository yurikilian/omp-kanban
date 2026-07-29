/**
 * Gets one usable event identifier from Next's decoded search-param value.
 * Repeated values are ambiguous, so a deep link only selects an event when it
 * names exactly one non-empty identifier.
 */
export function eventIdFromSearchParam(value: string | string[] | null | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/** Creates the canonical deep link for one event in one session. */
export function sessionEventUrl(sessionId: string, eventId: string, agentId?: string): string {
  return sessionUrl(sessionId, eventId, agentId);
}

/**
 * Gets one usable agent identifier from Next's decoded search-param value.
 * Repeated values are ambiguous, so a deep link only selects an agent when it
 * names exactly one non-empty identifier.
 */
export function agentIdFromSearchParam(value: string | string[] | null | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function sessionUrl(sessionId: string, eventId?: string, agentId?: string): string {
  const params = new URLSearchParams();
  if (eventId) params.set("event", eventId);
  if (agentId) params.set("agent", agentId);
  const query = params.toString();
  return `/sessions/${encodeURIComponent(sessionId)}${query ? `?${query}` : ""}`;
}

/** Creates the canonical deep link for one agent's timeline branch. */
export function sessionAgentUrl(sessionId: string, agentId: string, eventId?: string): string {
  return sessionUrl(sessionId, eventId, agentId);
}

export const SESSION_URL_CHANGE_EVENT = "session-url-change";