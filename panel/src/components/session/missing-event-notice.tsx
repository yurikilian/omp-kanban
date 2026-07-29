export interface MissingEventNoticeProps {
  eventId: string;
}

/** Explains why a valid session deep link has no selected timeline event. */
export function MissingEventNotice({ eventId }: MissingEventNoticeProps) {
  return (
    <p role="alert" className="text-sm text-muted-foreground">
      The event &quot;{eventId}&quot; could not be found in this session.
    </p>
  );
}