# Session cost forensics

## Data available

Full transcript for `2026-07-20T18-42-01-abcd1234` was readable, including
per-message `usage` objects for every assistant turn. Pricing was supplied
by the user for the models this session used.

## Where the money went

210,000 input tokens and 18,500 output tokens across the session, $4.62
total.

## Expensive patterns found

### Repeated repository context loading

Three agents loaded substantially overlapping files. Evidence: `evidence-1`,
`evidence-2`. Estimated savings: 38,000-76,000 input tokens ($0.76-$1.52).

### Mechanical fan-out running on a reasoning-tier model

Four smol-shaped subagents ran on `@slow` instead of `@smol`. Evidence:
`evidence-3`. Estimated savings: 20,000-42,000 input tokens, 3,000-6,100
output tokens ($0.65-$1.35).

### Suspiciously verbose error messages

A tool wrapper prints its full argument list on every retry. Not backed by
an entry in `audit.json` - this subsection should never have been here.

## Recommended changes

- Pin the fan-out worker's model role to `@smol` in `agents/kb-scout.md`
  (estimated, $0.65-$1.35).

## Proposed self-improvements

### Hooks

- `hooks/pre/session_start.ts`: cache a shared repository context artifact
  so the repeated read cannot recur. Estimated saving $0.76-$1.52/session.
  Maintenance cost: medium.

### Agents

- `agents/kb-scout.md`: pin the fan-out worker's model role to `smol`.
  Estimated saving $0.65-$1.35/session. Maintenance cost: low.

## Not worth changing

Nothing else in this session stood out as both expensive and fixable.
