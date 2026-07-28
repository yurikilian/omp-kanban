import { NextResponse } from "next/server";
import { createAuditJob, getLatestAuditJobForSession } from "@/server/audits/job-store";
import { getSessionDetail, isSafeSessionId } from "@/server/sessions/detail";

export const dynamic = "force-dynamic";

async function readSessionId(request: Request): Promise<string | null> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return null;

    const { sessionId } = body as { sessionId?: unknown };
    return typeof sessionId === "string" ? sessionId : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const sessionId = await readSessionId(request);
  if (!sessionId || !isSafeSessionId(sessionId)) {
    return NextResponse.json({ error: "Invalid session identifier" }, { status: 400 });
  }

  try {
    const session = await getSessionDetail(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Creating the queued record is deliberately all this request does. Runtime
    // dispatch may analyze it later, after the caller has received its id.
    const auditJob = await createAuditJob(sessionId);
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