import { NextResponse } from "next/server";
import { isSafeSessionId } from "@/server/sessions/detail";
import { getSessionTimeline } from "@/server/sessions/timeline";

// Session files change while the panel runs, so timeline responses must
// not be generated once at build time or cached as static output.
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
    const events = await getSessionTimeline(sessionId);
    if (!events) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(events);
  } catch {
    return NextResponse.json({ error: "Failed to load session timeline" }, { status: 500 });
  }
}