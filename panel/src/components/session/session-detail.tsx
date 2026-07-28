"use client";

import { useCallback, useEffect, useState } from "react";
import { AuditPanel } from "@/components/audit/audit-panel";
import type { AuditReport } from "@/server/audits/bundle-schema";
import { GenerateAuditButton } from "@/components/audit/generate-audit-button";
import { AgentTree } from "@/components/agents/agent-tree";
import { useLiveSessions } from "@/hooks/use-live-sessions";
import type { SessionDetail as SessionDetailData } from "@/server/sessions/detail";
import { EventStream } from "./event-stream";
import { MetricStrip } from "./metric-strip";
import { SessionHeader } from "./session-header";

export interface SessionDetailProps {
  session: SessionDetailData;
  audit?: AuditReport | null;
}

export function SessionDetail({ session, audit }: SessionDetailProps) {
  const [liveSession, setLiveSession] = useState(session);
  const [liveAudit, setLiveAudit] = useState<AuditReport | null>(audit ?? null);

  useEffect(() => {
    setLiveSession(session);
  }, [session]);

  useEffect(() => {
    setLiveAudit(audit ?? null);
  }, [audit]);

  const refreshSession = useCallback(
    async (sessionId: string) => {
      if (sessionId !== session.id) return;

      try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        if (!response.ok) return;

        const updatedSession = (await response.json()) as SessionDetailData;
        setLiveSession(updatedSession);
      } catch {
        return;
      }
    },
    [session.id],
  );

  useLiveSessions(refreshSession);

  return (
    <section role="region" aria-label="Session detail" className="space-y-2">
      <SessionHeader
        title={liveSession.title}
        status={liveSession.status}
        startedAt={liveSession.startedAt}
        durationMs={liveSession.durationMs}
      />
      <GenerateAuditButton sessionId={session.id} sessionTitle={session.title} />
      <MetricStrip
        costUsd={liveSession.costUsd}
        inputTokens={liveSession.inputTokens}
        outputTokens={liveSession.outputTokens}
        agentCount={liveSession.agentCount}
        toolCallCount={liveSession.toolCallCount}
      />
      <AuditPanel audit={liveAudit} />
      <EventStream sessionId={liveSession.id} />
      <AgentTree sessionId={session.id} />
    </section>
  );
}
