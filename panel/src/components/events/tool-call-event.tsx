import { CheckCircle2, Circle, Terminal, XCircle } from "lucide-react";
import { sanitizeText } from "@/lib/sanitize";
import { EventFrame, formatEventDuration, type EventStatus } from "./event-frame";

export type ToolCallOutcome = "success" | "error" | "pending";

export interface ToolCallEventProps {
  agent: string;
  timestamp: string;
  toolName: string;
  summary: string | null;
  input?: string | null;
  output?: string | null;
  durationMs: number | null;
  outcome: ToolCallOutcome;
  expanded?: boolean;
}

const STATUS_BY_OUTCOME: Record<ToolCallOutcome, EventStatus> = {
  success: "success",
  error: "error",
  pending: "running",
};

function OutcomeIcon({ outcome }: { outcome: ToolCallOutcome }) {
  if (outcome === "error") return <XCircle aria-hidden="true" className="size-3.5 shrink-0 text-destructive" />;
  if (outcome === "success") return <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />;
  return <Circle aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />;
}

/**
 * A tool call normally collapses to one line - tool name, summary, duration
 * and outcome - so the timeline stays scannable (E3-S7-AC1). The timeline
 * parent supplies expansion state when keyboard navigation requests details.
 */
export function ToolCallEvent({
  agent,
  timestamp,
  toolName,
  summary,
  input = null,
  output = null,
  durationMs,
  outcome,
  expanded = false,
}: ToolCallEventProps) {
  return (
    <EventFrame
      icon={<Terminal aria-hidden="true" className="size-4" />}
      agent={agent}
      timestamp={timestamp}
      duration={durationMs !== null ? formatEventDuration(durationMs) : undefined}
      status={STATUS_BY_OUTCOME[outcome]}
      label={
        <span
          data-slot="tool-call-line"
          className="flex min-w-0 items-center gap-1.5"
          style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          <span className="shrink-0 font-medium text-foreground">{toolName}</span>
          {summary && <span className="min-w-0 text-muted-foreground">{sanitizeText(summary)}</span>}
          <OutcomeIcon outcome={outcome} />
        </span>
      }
    >
      {expanded && (
        <dl data-slot="tool-call-details" className="space-y-2 text-sm">
          <div>
            <dt className="font-medium text-foreground">Input</dt>
            <dd className="m-0 whitespace-pre-wrap break-words text-muted-foreground">
              {input === null ? "Unavailable" : sanitizeText(input)}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Output</dt>
            <dd className="m-0 whitespace-pre-wrap break-words text-muted-foreground">
              {output === null ? "Unavailable" : sanitizeText(output)}
            </dd>
          </div>
        </dl>
      )}
    </EventFrame>
  );
}
