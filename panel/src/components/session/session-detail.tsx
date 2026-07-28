import os from "node:os";
import path from "node:path";
import { AuditPanel } from "@/components/audit/audit-panel";
import type { AuditReport } from "@/server/audits/bundle-schema";
import { auditsForSession, indexAuditBundles } from "@/server/audits/index-bundles";
import { GenerateAuditButton } from "@/components/audit/generate-audit-button";
import { AgentTree } from "@/components/agents/agent-tree";
import type { SessionDetail as SessionDetailData } from "@/server/sessions/detail";
import { EventStream } from "./event-stream";
import { MetricStrip } from "./metric-strip";
import { SessionHeader } from "./session-header";

export interface SessionDetailProps {
  session: SessionDetailData;
  audit?: AuditReport | null;
}

function completedAuditForSession(sessionId: string): AuditReport | null {
  const auditRoot = path.join(os.homedir(), ".omp", "forensics", "audits");
  const audits = auditsForSession(indexAuditBundles(auditRoot), sessionId);

  for (const indexedAudit of audits) {
    if (indexedAudit.validation.status === "valid" && indexedAudit.validation.manifest.status === "completed") {
      return indexedAudit.validation.audit;
    }
  }

  return null;
}

export function SessionDetail({ session, audit }: SessionDetailProps) {
  const completedAudit = audit === undefined ? completedAuditForSession(session.id) : audit;
  return (
    <section role="region" aria-label="Session detail" className="space-y-2">
      <SessionHeader
        title={session.title}
        status={session.status}
        startedAt={session.startedAt}
        durationMs={session.durationMs}
      />
      <GenerateAuditButton sessionId={session.id} sessionTitle={session.title} />
      <MetricStrip
        costUsd={session.costUsd}
        inputTokens={session.inputTokens}
        outputTokens={session.outputTokens}
        agentCount={session.agentCount}
        toolCallCount={session.toolCallCount}
      />
      <AuditPanel audit={completedAudit} />
      <EventStream sessionId={session.id} />
      <AgentTree sessionId={session.id} />
    </section>
  );
}