import os from "node:os";
import path from "node:path";
import { notFound } from "next/navigation";
import { SessionDetail } from "@/components/session/session-detail";
import type { AuditReport } from "@/server/audits/bundle-schema";
import { auditsForSession, indexAuditBundles } from "@/server/audits/index-bundles";
import { getSessionDetail } from "@/server/sessions/detail";

// Read live session files at request time rather than freezing a detail at
// build time.
export const dynamic = "force-dynamic";

const DEFAULT_AUDITS_ROOT = path.join(os.homedir(), ".omp", "forensics", "audits");

interface SessionDetailPageProps {
  params: Promise<{ sessionId: string }>;
}

/**
 * The most recently completed, validated audit for one session - what
 * SessionDetail's AuditPanel renders on first load, so a finding's
 * evidence links are already reachable without waiting on a live-stream
 * refresh (E4-S9-AC1, E4-S9-AC2).
 */
function completedAuditForSession(sessionId: string, auditsRoot: string = DEFAULT_AUDITS_ROOT): AuditReport | null {
  const index = indexAuditBundles(auditsRoot);

  let latest: AuditReport | null = null;
  let latestCompletedAt = "";
  for (const bundle of auditsForSession(index, sessionId)) {
    if (bundle.validation.status !== "valid" || bundle.validation.manifest.status !== "completed") continue;
    if (bundle.validation.manifest.completedAt > latestCompletedAt) {
      latest = bundle.validation.audit;
      latestCompletedAt = bundle.validation.manifest.completedAt;
    }
  }
  return latest;
}

export default async function SessionDetailPage({ params }: SessionDetailPageProps) {
  const { sessionId } = await params;
  const session = await getSessionDetail(sessionId);

  if (!session) notFound();

  const audit = completedAuditForSession(sessionId);

  return (
    <main className="p-6">
      <SessionDetail session={session} audit={audit} />
    </main>
  );
}
