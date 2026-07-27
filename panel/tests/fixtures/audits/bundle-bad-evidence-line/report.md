# Session cost forensics

## Data available

Full transcript for `2026-07-22T13-00-00-dddd4444` was readable.

## Where the money went

7,000 input tokens and 300 output tokens across the session.

## Expensive patterns found

### Duplicate config read across two agents

Two agents each read the same configuration file in full. Evidence:
`evidence-1`, `evidence-2`. Estimated savings: 900-1,300 input tokens.

## Recommended changes

- Share configuration context between agents instead of re-reading it.

## Proposed self-improvements

None proposed for this session.

## Not worth changing

Nothing else in this session stood out as both expensive and fixable.
