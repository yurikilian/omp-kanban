# Audit bundle contract

This is the contract between `kb-forensics` (the analyzer) and the panel (the
reader): the canonical directory a panel-dispatched audit is written to, the
four files every bundle contains, and the shape of each one.

The prompt definitions are the live behavior — `agents/kb-forensics.md` is
what actually governs what the analyzer writes, and
`skills/cost-forensics/SKILL.md` is what actually governs how it is dispatched.
This document is a developer-facing rendering of that same contract, kept in
sync with them by hand. Because `kb-forensics` is prompt-driven, nothing here
is guaranteed by construction — the panel validates every bundle as untrusted
input against a runtime schema rather than trusting this document at read
time.

## Canonical directory

```text
~/.omp/forensics/audits/<audit-id>/
```

The panel's audit job service creates this directory and the audit id before
it ever dispatches anything, and passes the directory's path to
`cost-forensics` as part of the dispatch. `kb-forensics` writes into the path
it is given — it never chooses or constructs this path itself, and this
document's default is what the job service uses to construct it, not
something the analyzer needs to know.

## Who writes what, who reads what

| Component | Role |
|---|---|
| Panel job service | creates the audit id and the bundle directory; dispatches `cost-forensics` (never `kb-forensics` directly); later reads and validates the finished bundle |
| `cost-forensics` skill | relays the audit id, target, bundle directory and pricing policy to `kb-forensics` unchanged — it decides none of them for a panel-dispatched audit |
| `kb-forensics` agent | writes all four files below into the bundle directory it was given |
| Panel UI | reads `audit.json` for structured findings, proposals and totals; links out to `report.md`; loads `evidence.jsonl` records by id on demand |

## Dispatch

A panel-dispatched audit carries four things through that chain, unchanged
from job service to `cost-forensics` to `kb-forensics`:

1. **Audit id** — and when it was created.
2. **Target** — one session transcript, with the input fingerprint the job
   service already computed for it (from target content and analyzer version
   only — never wall-clock time or process state).
3. **Bundle directory** — this canonical directory's path.
4. **Pricing policy** — pricing to use, carried verbatim, or an explicit
   instruction to report token-only because none was supplied. Either way,
   pricing is never recalled from model memory.

The panel never reaches `kb-forensics` on its own; it only ever gets there
through `cost-forensics`. See `skills/cost-forensics/SKILL.md` for the
documented procedure and `agents/kb-forensics.md` for what the analyzer does
with each of the four.

## The four files

```text
manifest.json
audit.json
report.md
evidence.jsonl
```

All four exist for every finished audit, regardless of outcome — including
`insufficient_signal` and `failed`. The names are fixed; only the size of
what is inside them varies.

## `manifest.json`

Lifecycle and integrity information. This is the one file the panel reads
first, to decide what state the audit is in before it trusts anything else in
the bundle.

```typescript
interface AuditManifest {
  schemaVersion: 1;
  auditId: string;
  status: "completed" | "insufficient_signal" | "failed";
  target: {
    sessionId: string;
    project?: string;        // omitted when the transcript is not grouped under one
    transcriptPath: string;
  };
  fingerprint: string;
  analyzer: { name: "kb-forensics"; version: string };
  createdAt: string;         // ISO 8601 — when the audit was created
  startedAt: string;         // ISO 8601 — when kb-forensics started work
  completedAt: string;       // ISO 8601 — when kb-forensics finished
  artifacts: {
    manifest: string;        // "manifest.json"
    audit: string;           // "audit.json"
    report: string;          // "report.md"
    evidence: string;        // "evidence.jsonl"
  };
  failureSummary?: string;   // present only when status === "failed"
}
```

Example — a completed audit:

```json
{
  "schemaVersion": 1,
  "auditId": "aud_01j9z3k2q4x5y6z7",
  "status": "completed",
  "target": {
    "sessionId": "2026-07-20T18-42-01-abcd1234",
    "project": "omp-kanban",
    "transcriptPath": "~/.omp/agent/sessions/omp-kanban/2026-07-20T18-42-01-abcd1234.jsonl"
  },
  "fingerprint": "sha256:4f9c2b7a1e...",
  "analyzer": { "name": "kb-forensics", "version": "1.0" },
  "createdAt": "2026-07-26T21:10:00Z",
  "startedAt": "2026-07-26T21:10:03Z",
  "completedAt": "2026-07-26T21:12:47Z",
  "artifacts": {
    "manifest": "manifest.json",
    "audit": "audit.json",
    "report": "report.md",
    "evidence": "evidence.jsonl"
  }
}
```

Example — insufficient signal (see [Status values](#status-values); note
there is no `failureSummary` — this is not a failure):

```json
{
  "schemaVersion": 1,
  "auditId": "aud_01j9z4m8r2n3p4q5",
  "status": "insufficient_signal",
  "target": {
    "sessionId": "2026-07-26T09-01-12-9f8e7d6c",
    "project": "omp-kanban",
    "transcriptPath": "~/.omp/agent/sessions/omp-kanban/2026-07-26T09-01-12-9f8e7d6c.jsonl"
  },
  "fingerprint": "sha256:9a1c3e8f02...",
  "analyzer": { "name": "kb-forensics", "version": "1.0" },
  "createdAt": "2026-07-26T09:05:00Z",
  "startedAt": "2026-07-26T09:05:02Z",
  "completedAt": "2026-07-26T09:05:40Z",
  "artifacts": {
    "manifest": "manifest.json",
    "audit": "audit.json",
    "report": "report.md",
    "evidence": "evidence.jsonl"
  }
}
```

Example — failed, with the one additional field:

```json
{
  "schemaVersion": 1,
  "auditId": "aud_01j9z5p1t7w8x9y0",
  "status": "failed",
  "target": {
    "sessionId": "2026-07-25T14-30-00-11223344",
    "transcriptPath": "~/.omp/agent/sessions/omp-kanban/2026-07-25T14-30-00-11223344.jsonl"
  },
  "fingerprint": "sha256:71bd44f0aa...",
  "analyzer": { "name": "kb-forensics", "version": "1.0" },
  "createdAt": "2026-07-25T14:31:00Z",
  "startedAt": "2026-07-25T14:31:02Z",
  "completedAt": "2026-07-25T14:31:09Z",
  "artifacts": {
    "manifest": "manifest.json",
    "audit": "audit.json",
    "report": "report.md",
    "evidence": "evidence.jsonl"
  },
  "failureSummary": "transcript path did not exist; nothing to parse"
}
```

## Status values

The full lifecycle (spec section 9):

```text
queued -> running -> one of: completed | failed | cancelled | insufficient_signal
```

Only the four terminal values ever appear in a bundle's `manifest.json`, and
only three of those are `kb-forensics`'s own to write:

| Status | Who records it | Where |
|---|---|---|
| `queued` | job service | its own job record — never in a bundle, because no bundle exists yet |
| `running` | job service | its own job record |
| `completed` | `kb-forensics` | `manifest.json`, once analysis finishes (findings may be zero) |
| `insufficient_signal` | `kb-forensics` | `manifest.json` — analysis finished; the target was genuinely too small to say anything useful about |
| `failed` (self-detected) | `kb-forensics` | `manifest.json`, with `failureSummary` — analysis could not proceed at all, e.g. an unreadable transcript |
| `failed` (crash) | job service | its own job record, from a non-zero exit or a missing manifest — `kb-forensics` never got the chance to write anything |
| `cancelled` | job service | its own job record, after stopping the analyzer child |

`insufficient_signal` is not a failure and is not a completed audit with zero
findings — it is its own outcome, and the panel is expected to label it
distinctly rather than folding it into either of the other two. Never
manufacture a finding to avoid reaching it.

The job service's own job-record store — where `queued`, `running` and
`cancelled` live — is a separate concern from this bundle contract and is not
decided here.

## `audit.json`

Canonical structured output — the data the panel renders. It contains coverage
and measurement gaps, session totals, cost and token breakdowns, findings,
proposals, and methodology notes:

```typescript
interface AuditReport {
  schemaVersion: 1;
  auditId: string;
  coverageGaps: string[];       // what could not be measured, and why
  sessionTotals: {
    inputTokens: number | null;
    outputTokens: number | null;
    cost: number | null;        // null whenever pricing was unavailable
    currency: string | null;
  };
  findings: Finding[];          // ranked — highest impact first; no separate rank field
  proposals: Proposal[];
  methodology: string;          // enough that a reader can tell how a number was reached
}
```

A finding carries its own confidence, evidence references and savings range:

```json
{
  "id": "finding-1",
  "category": "repeated_context_loading",
  "title": "Repeated repository context loading",
  "severity": "high",
  "confidence": "high",
  "summary": "Three agents loaded substantially overlapping files.",
  "observedImpact": {
    "inputTokens": 94000,
    "outputTokens": 0,
    "cost": null
  },
  "estimatedSavings": {
    "inputTokens": { "minimum": 38000, "likely": 61000, "maximum": 76000 },
    "cost": null
  },
  "evidenceIds": ["evidence-1", "evidence-2"],
  "causalChain": [],
  "limitations": [],
  "proposalIds": ["proposal-1"]
}
```

A proposal carries its own expected saving, maintenance cost and risk:

```json
{
  "id": "proposal-1",
  "type": "hook",
  "title": "Reuse a shared repository context artifact",
  "wastePrevented": ["finding-1"],
  "expectedSavings": {
    "inputTokens": { "minimum": 38000, "likely": 61000, "maximum": 76000 },
    "cost": null
  },
  "maintenanceCost": "medium",
  "implementationRisk": "low",
  "filesLikelyAffected": [],
  "validationPlan": [],
  "automaticApplicationAllowed": false
}
```

`automaticApplicationAllowed` is always `false` in practice today — nothing in
the panel applies a proposal, ever. The field exists so a bundle states that
fact rather than the panel assuming it.

Every monetary value is `null`, never a guessed number, when pricing was
unavailable — `cost` fields above are the common case. When `status` is
`insufficient_signal` or `failed`, `findings` and `proposals` are both empty
arrays; `coverageGaps` and `methodology` explain why.

`sessionTotals` is stated once, directly, by the analyzer. It is never the
arithmetic sum of `estimatedSavings` across findings that share evidence —
summing would double-count whatever those findings jointly cite.

## `report.md`

Human-readable rendering of the same conclusions as `audit.json` — the
`cost-forensics.md` template `agents/kb-forensics.md` documents for off-board
audits, unchanged in shape, written into the bundle instead of to a standalone
path.

It must never disagree with `audit.json`: every finding named in `audit.json`
appears in the report, and the report names no finding that `audit.json` does
not have.

## `evidence.jsonl`

Newline-delimited JSON, not a JSON array, so the panel can read it
incrementally instead of parsing a potentially large file whole before
showing anything. One record per distinct piece of evidence a finding or
proposal cites by id (`evidenceIds`, `wastePrevented`).

```typescript
interface EvidenceRecord {
  id: string;                 // referenced by findings/proposals as an evidenceIds entry
  sessionId: string;
  eventRef: string;           // a stable reference to the source event or tool result
  agentId: string;
  timestamp: string;          // ISO 8601
  eventType: string;          // e.g. "tool_call", "tool_result", "message"
  toolName?: string;          // present when eventType is tool-related
  measured: Record<string, number>; // the specific numbers this record backs
  explanation: string;        // one sentence: why this backs the finding it supports
  excerpt?: string;           // a bounded excerpt of the source content
  digest?: string;            // a content hash, used instead of excerpt above the size bound
  sourceLocation: string;     // file + line/offset, or an equivalent locator
}
```

Exactly one of `excerpt` or `digest` is present on a given record — never copy
an entire large tool result into `excerpt`. The exact size bound and the
conformance schema that enforces all of this are pinned down alongside
`audit.json`'s schema, where `evidence.jsonl` is validated.

## What this contract does not cover

- **Where the job service's own job records live** — a runtime file store
  beside the bundles, or a small database. Deferred until restart recovery
  needs it decided.
- **Whether cancellation ships, and how a cancelled bundle (if any) differs
  from this document** — deferred until the analyzer's mid-run termination
  behavior has been observed directly.
- **Schema versions beyond `1`.** `schemaVersion` exists so a future,
  incompatible change can be introduced without breaking readers of older
  bundles; nothing here assumes what a `2` would change.
