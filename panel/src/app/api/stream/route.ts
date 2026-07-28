import { watchSessions } from "@/server/sessions/watcher";
import type { SessionChange, SessionWatcher } from "@/server/sessions/watcher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SessionChangeSubscriber = (change: SessionChange) => void;

const encoder = new TextEncoder();
const subscribers = new Set<SessionChangeSubscriber>();
let watcher: SessionWatcher | undefined;

function publishSessionChange(change: SessionChange) {
  for (const subscriber of subscribers) {
    subscriber(change);
  }
}

function subscribeToSessionChanges(subscriber: SessionChangeSubscriber): () => void {
  subscribers.add(subscriber);
  watcher ??= watchSessions(publishSessionChange);

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) {
      watcher?.close();
      watcher = undefined;
    }
  };
}

function eventData(change: SessionChange): Uint8Array {
  return encoder.encode(`event: session-change\ndata: ${JSON.stringify(change)}\n\n`);
}

export function GET(request: Request): Response {
  let closeStream: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const unsubscribe = subscribeToSessionChanges((change) => {
        if (closed) return;

        try {
          controller.enqueue(eventData(change));
        } catch {
          closeStream?.();
        }
      });

      const finish = () => {
        if (closed) return;

        closed = true;
        unsubscribe();
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