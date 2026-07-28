import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { validateAuditBundle } from "@/server/audits/validate";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ auditId: string }>;
}

function isSafeAuditId(auditId: string): boolean {
  return auditId.length > 0 && auditId !== "." && auditId !== ".." && path.basename(auditId) === auditId;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { auditId } = await params;
  if (!isSafeAuditId(auditId)) {
    return NextResponse.json({ error: "Invalid audit identifier" }, { status: 400 });
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
      return NextResponse.json({ error: "Completed audit not found" }, { status: 404 });
    }

    return NextResponse.json(validation.audit);
  } catch {
    return NextResponse.json({ error: "Failed to load audit" }, { status: 500 });
  }
}
