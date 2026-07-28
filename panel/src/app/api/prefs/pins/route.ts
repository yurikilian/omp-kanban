import { NextResponse } from "next/server";
import { listSessionSummaries } from "@/server/sessions/repository";
import { readPinnedSessionIds, setSessionPinned, writePinnedSessionIds } from "@/server/preferences/pin-store";

// Pinned state always reflects whatever is on disk right now - never
// prerender or cache this route at build time.
export const dynamic = "force-dynamic";

/**
 * Drops any persisted pin whose session no longer exists (E3-S4-AC4) and
 * persists the cleanup, so a stale pin is removed once - not re-discovered
 * and re-filtered on every subsequent load.
 */
async function pruneToExistingSessions(pinnedIds: string[]): Promise<string[]> {
  const sessions = await listSessionSummaries();
  const existingIds = new Set(sessions.map((session) => session.id));
  const surviving = pinnedIds.filter((id) => existingIds.has(id));

  if (surviving.length !== pinnedIds.length) await writePinnedSessionIds(surviving);

  return surviving;
}

export async function GET() {
  try {
    const pinnedIds = await readPinnedSessionIds();
    return NextResponse.json({ pinnedSessionIds: await pruneToExistingSessions(pinnedIds) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load pinned sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface PinRequestBody {
  sessionId: string;
  pinned: boolean;
}

function isPinRequestBody(value: unknown): value is PinRequestBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "sessionId" in value &&
    typeof value.sessionId === "string" &&
    "pinned" in value &&
    typeof value.pinned === "boolean"
  );
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!isPinRequestBody(body)) {
      return NextResponse.json({ error: "sessionId (string) and pinned (boolean) are required" }, { status: 400 });
    }

    const pinnedSessionIds = await setSessionPinned(body.sessionId, body.pinned);
    return NextResponse.json({ pinnedSessionIds });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update the pinned session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
