import type { SessionDetail as SessionDetailData } from "@/server/sessions/detail";
import { EventStream } from "./event-stream";
import { MetricStrip } from "./metric-strip";
import { SessionHeader } from "./session-header";

export interface SessionDetailProps {
  session: SessionDetailData;
}

export function SessionDetail({ session }: SessionDetailProps) {
  return (
    <section role="region" aria-label="Session detail" className="space-y-2">
      <SessionHeader
        title={session.title}
        status={session.status}
        startedAt={session.startedAt}
        durationMs={session.durationMs}
      />
      <MetricStrip
        costUsd={session.costUsd}
        inputTokens={session.inputTokens}
        outputTokens={session.outputTokens}
        agentCount={session.agentCount}
        toolCallCount={session.toolCallCount}
      />
      <EventStream sessionId={session.id} />
    </section>
  );
}