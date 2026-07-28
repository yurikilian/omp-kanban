"use client";

import { useEffect, useId, useRef, useState } from "react";

interface DeleteSessionDialogProps {
  sessionId: string;
  sessionTitle: string;
  onDeleted: () => void;
}

export function DeleteSessionDialog({ sessionId, sessionTitle, onDeleted }: DeleteSessionDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!isOpen) return;

    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isDeleting) {
        event.preventDefault();
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", dismissOnEscape);
    return () => document.removeEventListener("keydown", dismissOnEscape);
  }, [isDeleting, isOpen]);

  const deleteSession = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete request failed");

      setIsOpen(false);
      onDeleted();
    } catch {
      setError(`Could not delete ${sessionTitle}.`);
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
          >
            <h2 id={headingId} className="text-lg font-semibold">
              Delete {sessionTitle}?
            </h2>
            <p id={descriptionId} className="mt-2 text-sm text-muted-foreground">
              This permanently deletes the session transcript and its sub-agent transcripts.
            </p>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
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
