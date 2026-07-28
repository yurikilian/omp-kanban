"use client";

export interface RerunAuditDialogProps {
  sessionTitle: string;
  isOpen: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RerunAuditDialog({
  sessionTitle,
  isOpen,
  isSubmitting,
  onCancel,
  onConfirm,
}: RerunAuditDialogProps) {
  if (!isOpen) return null;

  return (
    <div aria-labelledby="rerun-audit-title" role="dialog" aria-modal="true">
      <h2 id="rerun-audit-title">Rerun audit for {sessionTitle}?</h2>
      <p>This creates a new audit for the same target.</p>
      <button type="button" disabled={isSubmitting} onClick={onCancel}>
        Cancel
      </button>
      <button type="button" disabled={isSubmitting} onClick={onConfirm}>
        {isSubmitting ? "Rerunning audit…" : "Rerun audit"}
      </button>
    </div>
  );
}
