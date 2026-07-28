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

## Recommended changes

- Reuse a shared repository context artifact (estimated, $0.76-$1.52).

## Proposed self-improvements

### Hooks

- `hooks/pre/session_start.ts`: cache a shared repository context artifact
  so the repeated read cannot recur. Estimated saving $0.76-$1.52/session.
  Maintenance cost: medium.

## Not worth changing

Nothing else in this session stood out as both expensive and fixable.
