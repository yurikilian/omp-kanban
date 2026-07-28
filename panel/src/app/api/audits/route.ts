import { NextResponse } from "next/server";
import { createAuditJob, getLatestAuditJobForSession } from "@/server/audits/job-store";
import { getSessionDetail, isSafeSessionId } from "@/server/sessions/detail";

export const dynamic = "force-dynamic";

async function readAuditRequest(request: Request): Promise<{ sessionId: string; rerun: boolean } | null> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return null;

    const { sessionId, rerun } = body as { sessionId?: unknown; rerun?: unknown };
    if (typeof sessionId !== "string") return null;

    return { sessionId, rerun: rerun === true };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const auditRequest = await readAuditRequest(request);
  if (!auditRequest || !isSafeSessionId(auditRequest.sessionId)) {
    return NextResponse.json({ error: "Invalid session identifier" }, { status: 400 });
  }

  try {
    const session = await getSessionDetail(auditRequest.sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Creating the queued record is deliberately all this request does. Runtime
    // dispatch may analyze it later, after the caller has received its id.
    const auditJob = auditRequest.rerun
      ? await createAuditJob(auditRequest.sessionId, undefined, { rerun: true })
      : await createAuditJob(auditRequest.sessionId);
    return NextResponse.json(auditJob, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create audit" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId || !isSafeSessionId(sessionId)) {
    return NextResponse.json({ error: "Invalid session identifier" }, { status: 400 });
  }

  try {
    return NextResponse.json(await getLatestAuditJobForSession(sessionId));
  } catch {
    return NextResponse.json({ error: "Failed to load audit" }, { status: 500 });
  }
}