import { MessageSquare } from "lucide-react";
import { ContentView } from "@/components/content/content-view";
import { EventFrame } from "./event-frame";

export interface PromptEventProps {
  timestamp: string;
  text: string;
}

/**
 * A user prompt: always authored by the human, so its label is fixed
 * ("You") rather than an agent identity. The body renders through
 * `ContentView`, which both bounds it to a reading column and sanitises it
 * (E3-S7-AC1, E3-S7-AC7).
 */
export function PromptEvent({ timestamp, text }: PromptEventProps) {
  return (
    <EventFrame icon={<MessageSquare className="size-4" aria-hidden="true" />} label="You" timestamp={timestamp}>
      <ContentView text={text} />
    </EventFrame>
  );
}
