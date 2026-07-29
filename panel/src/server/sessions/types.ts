// The panel's own normalised session-list contract (E3-S1-AC6). This is the
// exact shape served by GET /api/sessions and consumed by the Sessions area
// — deliberately flat: no `stats` envelope, and no `acpId`/`live`/`busy`
// fields, which would describe a stateful ACP connection this read-only panel
// never holds.
//
// `costUsd`, `inputTokens` and `outputTokens` are `null` - never `0` - when a
// transcript recorded no usage data at all (E3-S1-AC2): the panel never
// infers a value it does not have.
export interface SessionSummary {
  id: string;
  title: string;
  project: string;
  startedAt: string;
  lastActivityAt: string;
  durationMs: number;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  agentCount: number;
  toolCallCount: number;
}
