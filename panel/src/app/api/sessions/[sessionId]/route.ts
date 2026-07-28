import { NextResponse } from "next/server";
import { getSessionDetail, isSafeSessionId } from "@/server/sessions/detail";
import { deleteSession } from "@/server/sessions/delete";

// Session files change while the panel runs, so detail responses must not be
// generated once at build time or cached as static output.
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { sessionId } = await params;

  if (!isSafeSessionId(sessionId)) {
    return NextResponse.json({ error: "Invalid session identifier" }, { status: 400 });
  }

  try {
    const session = await getSessionDetail(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch {
    return NextResponse.json({ error: "Failed to load session detail" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { sessionId } = await params;

  if (!isSafeSessionId(sessionId)) {
    return NextResponse.json({ error: "Invalid session identifier" }, { status: 400 });
  }

  try {
    const deleted = await deleteSession(sessionId);
    if (!deleted) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
