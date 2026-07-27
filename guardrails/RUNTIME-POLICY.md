# Runtime policy — the one source of truth

This file is the **only** place the shared agent-runtime guardrails are written. The block
between the two markers below is copied verbatim into every `agents/*.md` and every
`skills/*/SKILL.md` by `./sync-guardrails.py`, and `./validate.py` fails if any copy has
drifted. Edit this file, run the sync, commit both.

Why generation rather than a runtime include: omp has no import mechanism for agent
bodies — a `.md` body becomes a system prompt verbatim. An instruction to go read a policy
file costs a tool call in every agent on every run and can be skipped; a generated block
costs nothing at runtime and cannot be skipped.

Why it is short: every line here is paid for on every run of every agent. Each rule below
maps to a measured failure in the incident that motivated it (see
`docs/CONFIGURATION.md`). A rule that cannot be tied to one does not belong here.

<!-- BEGIN kb-guardrails -->
## Runtime guardrails

One real cycle spent 291 million accumulated tokens across 2,435 model calls — 96.83% of
them cache reads — with zero compactions and prompts reaching 301K tokens. A long session
resends its whole history on every round, so each extra round costs the entire prompt
again, and running six such sessions at once multiplies that. Every rule below either cuts
rounds or cuts what a round carries.

**Batch your tool calls.** Independent reads, searches, and commands belong in one round,
not one each. A `model → read → model → grep → model` loop pays for the full transcript at
every arrow.

**Read narrowly.** Ask for the line ranges you need, not whole files. Re-read a file only
after you have changed it. To see what changed, read the diff rather than reopening every
modified file.

**Bound command output.** Prefer one focused command over several one-liners. Send full
logs to a file and return the exit code, a short summary, the failing cases, and the log
path. Do not print lockfiles, generated files, dependency trees, or whole snapshots. When
you truncate, say that you truncated — and keep the head and tail of an error, which is
where the diagnosis lives.

**Run the narrow tests first.** Exercise what you changed before any broad suite.

**Respect your budgets.** Your session has a soft request budget and a hard stop at 1.5×
it. Below the soft limit, work normally. At it, stop exploring — finish, or write a
structured handoff and yield. Do not push on because tests are still failing: an agent
that hits its hard stop yields nothing, which is strictly worse than yielding partial work
with a clear resume point.

**A rate limit is infrastructure, not failure.** A 429, a usage-limit error, or a blocked
dispatch means pause — not that the task was wrong. Leave the worktree and any uncommitted
changes exactly as they are, record where you stopped and what remains, and yield. Work
resumes from that record. It is not restarted, and completed side effects are not repeated.

**Return small.** Give back only what your return contract asks for. Detail belongs in the
run database, where anyone who needs it can query it. Never return a transcript.
<!-- END kb-guardrails -->
