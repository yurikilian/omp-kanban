import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { sessionAgentUrl } from "@/lib/session-url";
import { resolveEvidenceForFinding } from "@/server/audits/evidence";

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
    const sessionsRoot = path.join(os.homedir(), ".omp", "agent", "sessions");
    const resolution = await resolveEvidenceForFinding({ bundleDirectory, auditId, evidenceId, sessionsRoot });

    if (resolution.status === "not-found") {
      return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
    }

    if (resolution.status === "event-missing") {
      return NextResponse.json({ status: "event-missing", evidenceId, eventRef: resolution.evidence.eventRef });
    }

    const { evidence } = resolution;
    return NextResponse.redirect(new URL(sessionAgentUrl(evidence.sessionId, evidence.agentId, evidence.eventRef), request.url));
  } catch {
    return NextResponse.json({ error: "Failed to resolve evidence" }, { status: 500 });
  }
}
