import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EventStatus = "running" | "success" | "error" | "waiting";

export interface EventFrameProps {
  icon: ReactNode;
  label: ReactNode;
  timestamp: string;
  agent?: string;
  duration?: string;
  status?: EventStatus;
  children?: ReactNode;
}

/**
 * Formats an event duration the same way session-level durations already
 * render elsewhere in the panel (hours/minutes/seconds cascading down to a
 * raw millisecond count for anything under a second).
 */
export function formatEventDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  if (totalSeconds > 0) return `${totalSeconds}s`;
  return `${durationMs}ms`;
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(date);
}

// A status only ever earns a border accent (a "key border", per the design
// system) - never a filled background - so an error stays visible without
// painting a full-bleed red surface (E3-S7-AC1).
const RAIL_CLASS_BY_STATUS: Record<EventStatus, string> = {
  running: "border-l-muted-foreground/40",
  waiting: "border-l-muted-foreground/40",
  success: "border-l-transparent",
  error: "border-l-destructive",
};

/**
 * The one shared card frame every timeline event type (other than the
 * compact status separator) renders through: an agent-rail border, an icon,
 * a header line carrying the label/agent/timestamp/duration, and an
 * optional content slot. Each event type supplies its own icon, label and
 * children to get its own visual treatment without re-implementing this
 * layout (E3-S7-AC1).
 */
export function EventFrame({ icon, label, timestamp, agent, duration, status, children }: EventFrameProps) {
  return (
    <div
      data-slot="event-frame"
      data-event-status={status}
      className={cn(
        "flex min-w-0 items-start gap-2 border-l-2 bg-transparent py-1 pl-2",
        status ? RAIL_CLASS_BY_STATUS[status] : "border-l-transparent",
      )}
      style={{ backgroundColor: "transparent" }}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-nowrap items-baseline gap-x-1.5 overflow-hidden">
          <span className="min-w-0 truncate text-sm text-foreground">{label}</span>
          {agent && <span className="shrink-0 text-xs text-muted-foreground">{agent}</span>}
          <time className="ml-auto shrink-0 text-xs text-muted-foreground" dateTime={timestamp}>
            {formatTimestamp(timestamp)}
          </time>
          {duration && (
            <span data-slot="event-duration" className="shrink-0 text-xs text-muted-foreground">
              {duration}
            </span>
          )}
        </div>
        {children && (
          <div data-slot="event-content" className="mt-1 min-w-0">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
