import { ArrowRight, GitBranch } from "lucide-react";
import { sanitizeText } from "@/lib/sanitize";
import { EventFrame } from "./event-frame";

export interface DelegationEventProps {
  timestamp: string;
  parentAgent: string;
  childAgent: string;
  task: string | null;
}

/**
 * A sub-agent spawn: the label always shows the parent agent, an arrow, and
 * the spawned child, so the hand-off itself is the headline rather than
 * something inferred from a plain tool-call line (E3-S7-AC1).
 */
export function DelegationEvent({ timestamp, parentAgent, childAgent, task }: DelegationEventProps) {
  return (
    <EventFrame
      icon={<GitBranch aria-hidden="true" className="size-4" />}
      timestamp={timestamp}
      label={
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="font-medium text-foreground">{parentAgent}</span>
          <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="font-medium text-foreground">{childAgent}</span>
        </span>
      }
    >
      {task && <p className="text-sm text-muted-foreground">Task: {sanitizeText(task)}</p>}
    </EventFrame>
  );
}