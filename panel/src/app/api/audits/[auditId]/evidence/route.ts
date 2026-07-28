import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { sessionAgentUrl } from "@/lib/session-url";
import type { EvidenceRecord } from "@/server/audits/bundle-schema";
import { validateAuditBundle } from "@/server/audits/validate";
import { isSafeSessionId } from "@/server/sessions/detail";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ auditId: string }>;
}

function isSafeAuditId(auditId: string): boolean {
  return auditId.length > 0 && auditId !== "." && auditId !== ".." && path.basename(auditId) === auditId;
}

function evidenceIdFromRequest(request: Request): string | null {
  const evidenceIds = new URL(request.url).searchParams.getAll("evidenceId");
  return evidenceIds.length === 1 && evidenceIds[0].length > 0 ? evidenceIds[0] : null;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { auditId } = await params;
  const evidenceId = evidenceIdFromRequest(request);
  if (!isSafeAuditId(auditId) || !evidenceId) {
    return NextResponse.json({ error: "Invalid evidence request" }, { status: 400 });
  }

  try {
    const bundleDirectory = path.join(os.homedir(), ".omp", "forensics", "audits", auditId);
    const validation = validateAuditBundle(bundleDirectory);
    if (
      validation.status !== "valid" ||
      validation.manifest.status !== "completed" ||
      validation.manifest.auditId !== auditId ||
      validation.audit.auditId !== auditId
    ) {
      return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
    }

    let evidence: EvidenceRecord | undefined;
    for (const record of validation.evidence) {
      if (record.id !== evidenceId) continue;
      if (evidence !== undefined) return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
      evidence = record;
    }
    const isCitedByFinding = validation.audit.findings.some((finding) => finding.evidenceIds.includes(evidenceId));
    if (
      !evidence ||
      !isCitedByFinding ||
      evidence.sessionId !== validation.manifest.target.sessionId ||
      !isSafeSessionId(evidence.sessionId)
    ) {
      return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
    }

    return NextResponse.redirect(new URL(sessionAgentUrl(evidence.sessionId, evidence.agentId, evidence.eventRef), request.url));
  } catch {
    return NextResponse.json({ error: "Failed to resolve evidence" }, { status: 500 });
  }
}
