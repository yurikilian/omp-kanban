export interface MetricStripProps {
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  agentCount: number;
  toolCallCount: number;
}

interface MetricItemProps {
  metric: string;
  term: string;
  value: string;
  label: string;
}

const stripStyle = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "nowrap",
} as const;

const itemStyle = {
  display: "inline-flex",
  borderWidth: 0,
  padding: 0,
  backgroundColor: "transparent",
} as const;

const valueStyle = { margin: 0 } as const;


function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toLocaleString("en-US");
}


function MetricItem({ metric, term, value, label }: MetricItemProps) {
  return (
    <div
      data-session-metric={metric}
      className="inline-flex items-baseline gap-x-1 whitespace-nowrap"
      style={itemStyle}
    >
      <dt className="sr-only">{term}</dt>
      <dd className="m-0 tabular-nums text-foreground" style={valueStyle}>
        {value} <span className="text-muted-foreground">{label}</span>
      </dd>
    </div>
  );
}

/**
 * Compact, flat session metrics. The strip deliberately has one shared
 * layout container and unboxed metric items; it must not devolve into a row
 * of decorative KPI cards (E3-S6-AC1).
 */
export function MetricStrip({ costUsd, inputTokens, outputTokens, agentCount, toolCallCount }: MetricStripProps) {
  const cost = costUsd === null ? "Unavailable" : `$${costUsd.toFixed(2)}`;
  const input = inputTokens === null ? "Unavailable" : formatTokenCount(inputTokens);
  const output = outputTokens === null ? "Unavailable" : formatTokenCount(outputTokens);

  return (
    <section role="region" aria-label="Session metrics">
      <dl
        className="flex flex-row flex-nowrap items-baseline gap-x-4 overflow-x-auto py-2 text-sm"
        style={stripStyle}
      >
        <MetricItem metric="cost" term="Cost" value={cost} label="cost" />
        <MetricItem
          metric="input-tokens"
          term="Input tokens"
          value={input}
          label="input"
        />
        <MetricItem
          metric="output-tokens"
          term="Output tokens"
          value={output}
          label="output"
        />
        <MetricItem
          metric="agents"
          term="Agents"
          value={agentCount.toLocaleString("en-US")}
          label={agentCount === 1 ? "agent" : "agents"}
        />
        <MetricItem
          metric="tool-calls"
          term="Tool calls"
          value={toolCallCount.toLocaleString("en-US")}
          label={toolCallCount === 1 ? "tool call" : "tool calls"}
        />
      </dl>
    </section>
  );
}
