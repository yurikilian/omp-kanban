import { formatTimestamp } from "./event-frame";

export interface StatusEventProps {
  timestamp: string;
  label: string;
}

/**
 * A status transition (session started, completed, interrupted...) never
 * earns the shared card frame every other event type renders through -
 * it is a compact separator instead, so a run of routine status changes
 * never reads as a wall of identical cards (E3-S7-AC1).
 */
export function StatusEvent({ timestamp, label }: StatusEventProps) {
  return (
    <div
      data-slot="status-event"
      role="separator"
      className="flex items-center gap-2 py-1 text-xs text-muted-foreground"
    >
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <span>{label}</span>
      <time dateTime={timestamp}>{formatTimestamp(timestamp)}</time>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}