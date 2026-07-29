"use client";

import { useCallback, useEffect, useState } from "react";
import { AuditPanel } from "@/components/audit/audit-panel";
import { cancelAudit } from "@/server/audits/cancel";
import type { AuditReport } from "@/server/audits/bundle-schema";
import type { AuditJob } from "@/server/audits/types";
import { GenerateAuditButton } from "@/components/audit/generate-audit-button";
import { subscribeToAuditChanges } from "@/lib/live-stream";
import { useLiveSessions } from "@/hooks/use-live-sessions";
import { AgentTree } from "@/components/agents/agent-tree";
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
  const [auditHistory, setAuditHistory] = useState<AuditJob[]>([]);
  const [auditHistorySessionId, setAuditHistorySessionId] = useState(session.id);

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

  const refreshAuditHistory = useCallback(
    async (sessionId: string) => {
      if (sessionId !== session.id) return;

      try {
        const response = await fetch(`/api/audits?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        if (!response.ok) return;

        const history: unknown = await response.json();
        if (!Array.isArray(history)) return;

        setAuditHistory(history as AuditJob[]);
        setAuditHistorySessionId(sessionId);
      } catch {
        return;
      }
    },
    [session.id],
  );

  const cancelAndRefreshAudit = useCallback(
    async (auditId: string) => {
      try {
        await cancelAudit(auditId);
      } finally {
        await refreshAuditHistory(session.id);
      }
    },
    [refreshAuditHistory, session.id],
  );

  useEffect(() => {
    setAuditHistory([]);
    setAuditHistorySessionId(session.id);
    void refreshAuditHistory(session.id);
  }, [session.id, refreshAuditHistory]);

  useLiveSessions(refreshSession);

  useEffect(() => {
    const unsubscribe = subscribeToAuditChanges(({ sessionId }) => {
      if (sessionId !== session.id) return;
      void refreshAuditHistory(sessionId);
    });

    return unsubscribe;
  }, [session.id, refreshAuditHistory]);

  const displayedAuditHistory = auditHistorySessionId === session.id ? auditHistory : [];

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
      <AuditPanel audit={liveAudit} auditJobs={displayedAuditHistory} onCancelAudit={cancelAndRefreshAudit} />
      <EventStream sessionId={liveSession.id} />
      <AgentTree sessionId={liveSession.id} />
    </section>
  );
}
