import { NextResponse } from "next/server";
import { listSessionSummaries } from "@/server/sessions/repository";

// Session data always reflects whatever is on disk right now - never
// prerender or cache this route at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessions = await listSessionSummaries();
    return NextResponse.json(sessions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
