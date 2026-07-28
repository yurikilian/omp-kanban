import { watchAudits } from "@/server/audits/watcher";
import type { AuditChange, AuditWatcher } from "@/server/audits/watcher";
import { watchSessions } from "@/server/sessions/watcher";
import type { SessionChange, SessionWatcher } from "@/server/sessions/watcher";

export const dynamic = "force-dynamic";
type SessionChangeSubscriber = (change: SessionChange) => void;
type AuditChangeSubscriber = (change: AuditChange) => void;

const encoder = new TextEncoder();
const sessionSubscribers = new Set<SessionChangeSubscriber>();
const auditSubscribers = new Set<AuditChangeSubscriber>();
let sessionWatcher: SessionWatcher | undefined;
let auditWatcher: AuditWatcher | undefined;

function publishSessionChange(change: SessionChange) {
  for (const subscriber of sessionSubscribers) {
    subscriber(change);
  }
}

function publishAuditChange(change: AuditChange) {
  for (const subscriber of auditSubscribers) {
    subscriber(change);
  }
}

function subscribeToSessionChanges(subscriber: SessionChangeSubscriber): () => void {
  sessionSubscribers.add(subscriber);
  sessionWatcher ??= watchSessions(publishSessionChange);

  return () => {
    sessionSubscribers.delete(subscriber);
    if (sessionSubscribers.size === 0 && auditSubscribers.size === 0) {
      sessionWatcher?.close();
      sessionWatcher = undefined;
    }
  };
}

function subscribeToAuditChanges(subscriber: AuditChangeSubscriber): () => void {
  auditSubscribers.add(subscriber);
  auditWatcher ??= watchAudits(publishAuditChange);

  return () => {
    auditSubscribers.delete(subscriber);
    if (sessionSubscribers.size === 0 && auditSubscribers.size === 0) {
      auditWatcher?.close();
      auditWatcher = undefined;
    }
  };
}

function sessionEventData(change: SessionChange): Uint8Array {
  return encoder.encode(`event: session-change\ndata: ${JSON.stringify(change)}\n\n`);
}

function auditEventData(change: AuditChange): Uint8Array {
  return encoder.encode(`event: audit-change\ndata: ${JSON.stringify(change)}\n\n`);
}

function eventData(change: SessionChange): Uint8Array {
  return encoder.encode(`event: session-change\ndata: ${JSON.stringify(change)}\n\n`);
}

export function GET(request: Request): Response {
  let closeStream: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const unsubscribeSession = subscribeToSessionChanges((change) => {
        if (closed) return;
        try {
          controller.enqueue(sessionEventData(change));
        } catch {
          closeStream?.();
        }
      });

      const unsubscribeAudit = subscribeToAuditChanges((change) => {
        if (closed) return;
        try {
          controller.enqueue(auditEventData(change));
        } catch {
          closeStream?.();
        }
      });

      const finish = () => {
        if (closed) return;
        closed = true;
        unsubscribeSession();
        unsubscribeAudit();
        request.signal.removeEventListener("abort", finish);
        try {
          controller.close();
        } catch {
          return;
        }
      };

      closeStream = finish;
      controller.enqueue(encoder.encode("retry: 1000\n\n"));
      request.signal.addEventListener("abort", finish, { once: true });
    },
    cancel() {
      closeStream?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}