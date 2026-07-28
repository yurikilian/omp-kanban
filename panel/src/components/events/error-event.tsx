import { AlertTriangle } from "lucide-react";
import { sanitizeText } from "@/lib/sanitize";
import { EventFrame } from "./event-frame";

export interface ErrorEventProps {
  timestamp: string;
  agent: string;
  text: string;
}

/**
 * An error still renders through the shared frame - never a bespoke
 * full-bleed red card - so it stays visible via the same border-accent
 * treatment a failed tool call already gets, distinguished only by its
 * own icon and failure text (E3-S7-AC1).
 */
export function ErrorEvent({ timestamp, agent, text }: ErrorEventProps) {
  return (
    <EventFrame
      icon={<AlertTriangle aria-hidden="true" className="size-4 text-destructive" />}
      label="Error"
      agent={agent}
      timestamp={timestamp}
      status="error"
    >
      <p className="text-sm text-destructive">{sanitizeText(text)}</p>
    </EventFrame>
  );
}