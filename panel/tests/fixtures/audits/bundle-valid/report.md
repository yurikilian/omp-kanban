# Session cost forensics

## Data available

Full transcript for `2026-07-22T10-15-00-aaaa1111` was readable. No pricing
source was supplied, so this report states token counts only.

## Where the money went

12,000 input tokens and 900 output tokens across the session. One pattern
accounts for the majority of the avoidable spend.

## Expensive patterns found

### Full log file read instead of tailed

One tool call read an entire log file where the last 50 lines would have
answered the question. Evidence: `evidence-1`. Estimated savings:
2,000-3,800 input tokens.

## Recommended changes

- Prefer `tail -n 50` over a full file read when only recent lines matter.

## Proposed self-improvements

None proposed for this session.

## Not worth changing

Nothing else in this session stood out as both expensive and fixable.
