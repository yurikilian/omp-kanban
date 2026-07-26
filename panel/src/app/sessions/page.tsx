import { SessionListStates } from "@/components/session/session-list-states";

export default function SessionsPage() {

  return (
    <main className="p-6">
      <h1 className="mb-4 text-lg font-semibold text-foreground">Sessions</h1>
      <SessionListStates />
    </main>
  );
}
