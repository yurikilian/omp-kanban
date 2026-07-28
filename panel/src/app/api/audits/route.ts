import { NextResponse } from "next/server";
import { createAuditJob, getLatestAuditJobForSession } from "@/server/audits/job-store";
import { getSessionDetail, isSafeSessionId } from "@/server/sessions/detail";
import { resolveAuditPricing } from "@/server/audits/pricing";

export const dynamic = "force-dynamic";

async function readAuditRequest(
  request: Request,
): Promise<{ sessionId: string | null; pricing: string | undefined }> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return { sessionId: null, pricing: undefined };

    const { sessionId, pricing } = body as { sessionId?: unknown; pricing?: unknown };
    return {
      sessionId: typeof sessionId === "string" ? sessionId : null,
      pricing: typeof pricing === "string" ? pricing : undefined,
    };
  } catch {
    return { sessionId: null, pricing: undefined };
  }
}

export async function POST(request: Request) {
  const { sessionId, pricing } = await readAuditRequest(request);
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
    const auditJob = await createAuditJob(sessionId, resolveAuditPricing(pricing));
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