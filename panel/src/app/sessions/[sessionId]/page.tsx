import { notFound } from "next/navigation";
import { SessionDetail } from "@/components/session/session-detail";
import { getSessionDetail } from "@/server/sessions/detail";

// Read live session files at request time rather than freezing a detail at
// build time.
export const dynamic = "force-dynamic";

interface SessionDetailPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function SessionDetailPage({ params }: SessionDetailPageProps) {
  const { sessionId } = await params;
  const session = await getSessionDetail(sessionId);

  if (!session) notFound();

  return (
    <main className="p-6">
      <SessionDetail session={session} />
    </main>
  );
}
