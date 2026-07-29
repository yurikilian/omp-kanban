"use client";

import { useEffect, useId, useRef, useState } from "react";

interface DeleteFailure {
  message: string;
  /** A transient server or disk error is worth retrying; a rejected request is not. */
  retryable: boolean;
}

/**
 * The server's own explanation of what failed, so the dialog reports the real
 * cause rather than a generic message (E3-S5-AC5).
 */
async function failureMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => undefined);

  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" && body.error) {
    return body.error;
  }

  return `The delete request failed with status ${response.status}.`;
}

interface DeleteSessionDialogProps {
  sessionId: string;
  sessionTitle: string;
  onDeleted: () => void;
}

export function DeleteSessionDialog({ sessionId, sessionTitle, onDeleted }: DeleteSessionDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<DeleteFailure | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const headingId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (isOpen) {
      cancelButtonRef.current?.focus();
    } else if (wasOpenRef.current) {
      triggerRef.current?.focus();
    }

    wasOpenRef.current = isOpen;
  }, [isOpen]);


  const deleteSession = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      // A failed delete leaves the row in place: only a 2xx means the
      // transcript and its sub-agent directory are both gone (see
      // server/sessions/delete.ts), so a partial removal reports as a failure.
      if (!response.ok) {
        setError({ message: await failureMessage(response), retryable: response.status >= 500 });
        setIsDeleting(false);
        return;
      }

      setIsOpen(false);
      onDeleted();
    } catch {
      setError({ message: `Could not reach the server to delete ${sessionTitle}.`, retryable: true });
      setIsDeleting(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Delete ${sessionTitle}`}
        className="rounded-md px-2 py-1 text-sm text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setIsOpen(true)}
      >
        Delete
      </button>
      {isOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            aria-describedby={descriptionId}
            className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !isDeleting) {
                event.preventDefault();
                event.stopPropagation();
                setIsOpen(false);
              }
            }}
          >
            <h2 id={headingId} className="text-lg font-semibold">
              Delete {sessionTitle}?
            </h2>
            <p id={descriptionId} className="mt-2 text-sm text-muted-foreground">
              This permanently deletes the session transcript and its sub-agent transcripts.
            </p>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error.message} {error.retryable ? "You can try again." : "Retrying will not help."}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                ref={cancelButtonRef}
                type="button"
                className="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={isDeleting}
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                disabled={isDeleting}
                onClick={deleteSession}
              >
                {isDeleting ? "Deleting…" : "Delete session"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
