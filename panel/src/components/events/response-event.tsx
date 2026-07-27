import { Bot } from "lucide-react";
import { ContentView } from "@/components/content/content-view";
import { EventFrame, formatEventDuration } from "./event-frame";

export interface ResponseEventProps {
  agent: string;
  timestamp: string;
  text: string;
  model: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toLocaleString("en-US");
}

/**
 * Model, duration, tokens and cost each contribute their own segment only
 * when the transcript actually recorded that value - a value the transcript
 * never recorded is left out entirely rather than rendered as 0 (E3-S7-AC4).
 */
function secondaryMetadata(
  model: string | null,
  durationMs: number | null,
  inputTokens: number | null,
  outputTokens: number | null,
  costUsd: number | null,
): string[] {
  const parts: string[] = [];
  if (model) parts.push(model);
  if (durationMs !== null) parts.push(formatEventDuration(durationMs));
  if (inputTokens !== null) parts.push(`${formatTokenCount(inputTokens)} in`);
  if (outputTokens !== null) parts.push(`${formatTokenCount(outputTokens)} out`);
  if (costUsd !== null) parts.push(`$${costUsd.toFixed(2)}`);
  return parts;
}

/**
 * An agent response: body text through the same bounded, sanitised
 * `ContentView` a prompt uses (E3-S7-AC1), with model/duration/tokens/cost
 * rendered underneath as secondary text (E3-S7-AC4).
 */
export function ResponseEvent({
  agent,
  timestamp,
  text,
  model,
  durationMs,
  inputTokens,
  outputTokens,
  costUsd,
}: ResponseEventProps) {
  const metadata = secondaryMetadata(model, durationMs, inputTokens, outputTokens, costUsd);

  return (
    <EventFrame icon={<Bot className="size-4" aria-hidden="true" />} label={agent} timestamp={timestamp}>
      <ContentView text={text} />
      {metadata.length > 0 && (
        <p data-slot="response-metadata" className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {metadata.map((part, index) => (
            <span key={`${index}-${part}`} className="inline-flex items-center gap-x-1.5">
              {index > 0 && <span aria-hidden="true">Β·</span>}
              {part}
            </span>
          ))}
        </p>
      )}
    </EventFrame>
  );
}
