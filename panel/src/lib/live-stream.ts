export interface SessionChange {
  sessionId: string;
}

type SessionChangeListener = (change: SessionChange) => void;

const listeners = new Set<SessionChangeListener>();
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

function startStream() {
  if (stream || typeof EventSource === "undefined") return;

  stream = new EventSource("/api/stream");
  stream.addEventListener("session-change", (event) => {
    const change = parseSessionChange((event as MessageEvent<string>).data);
    if (!change) return;

    for (const listener of listeners) {
      listener(change);
    }
  });
}


export function subscribeToSessionChanges(listener: SessionChangeListener): () => void {
  listeners.add(listener);
  startStream();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stream) {
      stream.close();
      stream = undefined;
    }
  };
}