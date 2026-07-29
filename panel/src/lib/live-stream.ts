import type { AuditLifecycleStatus } from "./audit-states";

export interface SessionChange {
  sessionId: string;
}

export interface AuditChange {
  sessionId: string;
  status: AuditLifecycleStatus;
}

const AUDIT_LIFECYCLE_STATUSES: Record<AuditLifecycleStatus, true> = {
  queued: true,
  running: true,
  completed: true,
  failed: true,
  cancelled: true,
  insufficient_signal: true,
};

function isAuditLifecycleStatus(status: string): status is AuditLifecycleStatus {
  return Object.hasOwn(AUDIT_LIFECYCLE_STATUSES, status);
}

type SessionChangeListener = (change: SessionChange) => void;
type AuditChangeListener = (change: AuditChange) => void;

const sessionListeners = new Set<SessionChangeListener>();
const auditListeners = new Set<AuditChangeListener>();
let stream: EventSource | undefined;

function parseSessionChange(data: string): SessionChange | null {
  try {
    const value: unknown = JSON.parse(data);
    if (
      typeof value === "object" &&
      value !== null &&
      "sessionId" in value &&
      typeof value.sessionId === "string"
    ) {
      return { sessionId: value.sessionId };
    }
  } catch {
    return null;
  }

  return null;
}

function parseAuditChange(data: string): AuditChange | null {
  try {
    const value: unknown = JSON.parse(data);
    if (
      typeof value === "object" &&
      value !== null &&
      "sessionId" in value &&
      typeof value.sessionId === "string" &&
      "status" in value &&
      typeof value.status === "string" &&
      isAuditLifecycleStatus(value.status)
    ) {
      return { sessionId: value.sessionId, status: value.status };
    }
  } catch {
    return null;
  }

  return null;
}

function startStream() {
  if (stream || typeof EventSource === "undefined") return;

  stream = new EventSource("/api/stream");
  stream.addEventListener("session-change", (event) => {
    const change = parseSessionChange((event as MessageEvent<string>).data);
    if (!change) return;

    for (const listener of sessionListeners) {
      listener(change);
    }
  });

  stream.addEventListener("audit-change", (event) => {
    const change = parseAuditChange((event as MessageEvent<string>).data);
    if (!change) return;

    for (const listener of auditListeners) {
      listener(change);
    }
  });
}

export function subscribeToSessionChanges(listener: SessionChangeListener): () => void {
  sessionListeners.add(listener);
  startStream();

  return () => {
    sessionListeners.delete(listener);
    if (sessionListeners.size === 0 && auditListeners.size === 0 && stream) {
      stream.close();
      stream = undefined;
    }
  };
}

export function subscribeToAuditChanges(listener: AuditChangeListener): () => void {
  auditListeners.add(listener);
  startStream();

  return () => {
    auditListeners.delete(listener);
    if (sessionListeners.size === 0 && auditListeners.size === 0 && stream) {
      stream.close();
      stream = undefined;
    }
  };
}
