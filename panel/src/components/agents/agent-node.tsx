import { formatEventDuration } from "@/components/events/event-frame";
import { sanitizeText } from "@/lib/sanitize";
import { AgentBadge } from "./agent-badge";

// The main transcript's own agent name everywhere else in the panel (see
// timeline.ts) - the only agent in a hierarchy that is structurally always
// the session's coordinator, never a guess about its actual specialty.
const ROOT_AGENT_NAME = "main";

export interface AgentNodeStatus {
  label: string;
  basis: string;
  derived: true;
}

export interface AgentNodeProps {
  name: string;
  path: string[];
  parentUnknown: boolean;
  /** Nesting depth under the root, for indentation. Defaults to 0 (root). */
  depth?: number;
  status: AgentNodeStatus;
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
 * One row in the session's agent hierarchy: name, a monogram, a labelled
 * role badge, its full hierarchical path and a textual status, plus
 * duration/tokens/cost with any value the transcripts never recorded read
 * as "Unavailable" rather than a fabricated zero (E3-S8-AC1, E3-S8-AC2).
 * An agent whose spawning parent could not be correlated is marked
 * unknown-parent rather than silently nested under a guess (E3-S8-AC6).
 *
 * Presentational only - nesting `children` under their spawner is
 * `AgentTree`'s job, which also owns the accessible tree structure
 * (E3-S8-AC5, a later task) built on top of one row of this shape.
 */
export function AgentNode({
  name,
  path,
  parentUnknown,
  depth = 0,
  status,
  durationMs,
  inputTokens,
  outputTokens,
  costUsd,
}: AgentNodeProps) {
  const safeName = sanitizeText(name);
  const monogram = safeName.trim().match(/[A-Za-z0-9]/)?.[0]?.toUpperCase() ?? "?";
  // The root is structurally the coordinator. For every other agent,
  // preserve an exact documented family name from its transcript filename
  // (for example "Planner"); AgentBadge's resolver gives custom names its
  // explicit Unknown fallback rather than inventing a specialty.
  const family = name === ROOT_AGENT_NAME ? "coordinator" : name;

  const duration = durationMs === null ? "Unavailable" : formatEventDuration(durationMs);
  const input = inputTokens === null ? "Unavailable" : formatTokenCount(inputTokens);
  const output = outputTokens === null ? "Unavailable" : formatTokenCount(outputTokens);
  const cost = costUsd === null ? "Unavailable" : `$${costUsd.toFixed(2)}`;

  return (
    <div
      data-testid="agent-node"
      data-slot="agent-node"
      className="flex min-w-0 items-start gap-2 border-l-2 border-l-transparent py-1.5 pl-2"
      style={{ marginLeft: depth * 20 }}
    >
      <span
        aria-hidden="true"
        data-slot="agent-monogram"
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-medium text-foreground"
      >
        {monogram}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span data-slot="agent-name" className="font-medium text-foreground">
            {safeName}
          </span>
          <AgentBadge family={family} />
          <span data-slot="agent-status" title={`Derived from ${status.basis}`} className="text-xs text-muted-foreground">
            {status.label}
          </span>
          {parentUnknown && (
            <span data-slot="agent-unknown-parent" className="text-xs italic text-muted-foreground">
              Unknown parent
            </span>
          )}
        </div>
        <p data-slot="agent-path" className="truncate text-xs text-muted-foreground">
          {path.map((segment) => sanitizeText(segment)).join(" / ")}
        </p>
        <p data-slot="agent-metrics" className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span data-metric="duration">{duration}</span>
          <span data-metric="input-tokens">{input} input</span>
          <span data-metric="output-tokens">{output} output</span>
          <span data-metric="cost">{cost}</span>
        </p>
      </div>
    </div>
  );
}