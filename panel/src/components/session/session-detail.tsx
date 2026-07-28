"use client";

import { useCallback, useEffect, useState } from "react";
import { useLiveSessions } from "@/hooks/use-live-sessions";
import type { SessionDetail as SessionDetailData } from "@/server/sessions/detail";
import { EventStream } from "./event-stream";
import { MetricStrip } from "./metric-strip";
import { SessionHeader } from "./session-header";

export interface SessionDetailProps {
  session: SessionDetailData;
}

export function SessionDetail({ session }: SessionDetailProps) {
  const [liveSession, setLiveSession] = useState(session);

  useEffect(() => {
    setLiveSession(session);
  }, [session]);

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
      <MetricStrip
        costUsd={liveSession.costUsd}
        inputTokens={liveSession.inputTokens}
        outputTokens={liveSession.outputTokens}
        agentCount={liveSession.agentCount}
        toolCallCount={liveSession.toolCallCount}
      />
      <EventStream sessionId={liveSession.id} />
    </section>
  );
}