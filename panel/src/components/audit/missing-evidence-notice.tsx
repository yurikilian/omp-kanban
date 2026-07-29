export interface MissingEvidenceNoticeProps {
  evidenceId: string;
}

/**
 * Explains why activating one finding's evidence link did not open an
 * event: the evidence record still exists, but its `eventRef` no longer
 * names a real event in the session transcript. Renders in place of the
 * link so the rest of the finding stays readable (E4-S9-AC3).
 */
export function MissingEvidenceNotice({ evidenceId }: MissingEvidenceNoticeProps) {
  return (
    <p role="alert" className="text-sm text-muted-foreground">
      The event referenced by evidence &quot;{evidenceId}&quot; could not be located in the transcript.
    </p>
  );
}
