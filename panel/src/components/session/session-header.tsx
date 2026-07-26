export interface SessionStatusDisplay {
  label: string;
  basis: string;
  derived: true;
}

export interface SessionHeaderProps {
  title: string;
  status: SessionStatusDisplay;
  startedAt: string;
  durationMs: number;
}

const headerLineStyle = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "nowrap",
} as const;

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  if (totalSeconds > 0) return `${totalSeconds}s`;
  return `${durationMs}ms`;
}

function formatStartTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function SessionHeader({ title, status, startedAt, durationMs }: SessionHeaderProps) {
  return (
    <div
      role="group"
      aria-label="Session header"
      className="flex min-w-0 flex-nowrap items-baseline gap-x-2 overflow-hidden"
      style={headerLineStyle}
    >
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-foreground">{title}</h1>
      <span className="inline-flex shrink-0 items-baseline gap-x-1">
        <span className="font-medium text-foreground">{status.label}</span>
        <span aria-hidden="true" className="text-muted-foreground">
          ·
        </span>
        <span className="text-xs text-muted-foreground">Derived from {status.basis}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-muted-foreground">
        ·
      </span>
      <time className="shrink-0 text-sm text-muted-foreground" dateTime={startedAt}>
        {formatStartTime(startedAt)}
      </time>
      <span aria-hidden="true" className="shrink-0 text-muted-foreground">
        ·
      </span>
      <span className="shrink-0 text-sm text-muted-foreground">{formatDuration(durationMs)}</span>
    </div>
  );
}
