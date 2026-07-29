import os from "node:os";
import path from "node:path";
import { notFound } from "next/navigation";
import { SessionDetail } from "@/components/session/session-detail";
import type { AuditReport } from "@/server/audits/bundle-schema";
import { readCompletedAuditMetadata } from "@/server/audits/index-bundles";
import { getAuditJobsForSession } from "@/server/audits/job-store";
import { getSessionDetail } from "@/server/sessions/detail";

// Read live session files at request time rather than freezing a detail at
// build time.
export const dynamic = "force-dynamic";

const DEFAULT_AUDITS_ROOT = path.join(os.homedir(), ".omp", "forensics", "audits");

interface SessionDetailPageProps {
  params: Promise<{ sessionId: string }>;
}

/**
 * The most recent completed audit in canonical job history whose manifest
 * and audit metadata still agree with that history. This deliberately does
 * not validate evidence: EvidenceLink's targeted resolver owns that I/O
 * after the user activates a citation (E4-S9-AC4).
 */
async function completedAuditForSession(
  sessionId: string,
  auditsRoot: string = DEFAULT_AUDITS_ROOT,
): Promise<AuditReport | null> {
  const jobs = await getAuditJobsForSession(sessionId);

  for (let index = jobs.length - 1; index >= 0; index -= 1) {
    const job = jobs[index];
    if (job.status !== "completed") continue;

    const audit = readCompletedAuditMetadata(auditsRoot, { auditId: job.id, sessionId });
    if (audit) return audit;
  }

  return null;
}

export default async function SessionDetailPage({ params }: SessionDetailPageProps) {
  const { sessionId } = await params;
  const session = await getSessionDetail(sessionId);

  if (!session) notFound();

  const audit = await completedAuditForSession(sessionId);

  return (
    <main className="p-6">
      <SessionDetail session={session} audit={audit} />
    </main>
  );
}
