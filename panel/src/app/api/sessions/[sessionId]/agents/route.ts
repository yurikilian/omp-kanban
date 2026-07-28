import { NextResponse } from "next/server";
import { getSessionAgents } from "@/server/sessions/agents";
import { isSafeSessionId } from "@/server/sessions/detail";

// Session files change while the panel runs, so agent-hierarchy responses
// must not be generated once at build time or cached as static output.
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
    const agents = await getSessionAgents(sessionId);
    if (!agents) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(agents);
  } catch {
    return NextResponse.json({ error: "Failed to load session agent hierarchy" }, { status: 500 });
  }
}