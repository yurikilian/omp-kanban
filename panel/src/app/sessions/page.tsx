import { SessionList } from "@/components/session/session-list";
import { listSessionSummaries } from "@/server/sessions/repository";

// Session data always reflects whatever is on disk right now - never
// prerender or cache this page at build time.
export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const sessions = await listSessionSummaries();

  return (
    <main className="p-6">
      <h1 className="mb-4 text-lg font-semibold text-foreground">Sessions</h1>
      <SessionList sessions={sessions} />
    </main>
  );
}
