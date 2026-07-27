---
name: cost-forensics
description: Audits omp session spend and proposes self-improvements to the board. Dispatches the kb-forensics agent to find where tokens and money actually went in a session or kanban run, then turns each recurring waste pattern into a concrete proposal — a new or modified hook, skill, or agent — ranked by expected saving. Use whenever the user says a session or cycle was expensive, asks where the spend went, wants to cut token usage, or asks the board to improve itself. Also use after a kanban cycle when the user wants a cost audit of the run.
---

# Cost Forensics

Find where the money went, then propose how to stop it going there again. This is
an off-board, self-improvement pass: it audits real session transcripts and
returns both a cost breakdown and a ranked set of proposals for new or modified
hooks, skills, and agents. It does not run as part of a kanban cycle — dispatch it
on its own when spend needs auditing.

You orchestrate. `kb-forensics` does the analysis and writes the report; you pick
the target, hand it the report path, and relay the result. You do not measure
costs or propose changes yourself.

## Before dispatching

**Pick the audit target.** One of:

- **A kanban run** — the user points at a `.kanban/runs/<...>/` directory, or you
  just finished one. The run's artifacts plus its session transcript are the
  subject.
- **A session** — a specific `~/.omp/agent/sessions/**/*.jsonl`, or "the last
  session" (newest by mtime).
- **Recent spend generally** — no specific target; audit the most recent sessions.

If the user has not said which, and the choice changes the answer, ask. Otherwise
default to the most recent session.

**Pick the report path.** The report is prose a human reads:

- Auditing a kanban run → `<run_dir>/cost-forensics.md`.
- Otherwise → `.kanban/forensics/$(date +%Y%m%d-%H%M%S)-cost-forensics.md`
  (create `.kanban/forensics/` if absent; add `.kanban/` to `.gitignore` if it is
  not already ignored).

## Dispatch

Dispatch `kb-forensics` with `task`. Give it, in the assignment:

- the **report path** you chose (it writes exactly one file, there);
- the **audit target** — the session file(s) or `run_dir` to analyze, or
  "most recent sessions" if general;
- any **pricing** the user supplied (otherwise it reports tokens and says pricing
  was unavailable — it never recalls prices from memory).

It discovers the session schema before parsing, measures what is measurable,
reports gaps honestly, ranks knob-level recommendations, and then runs the
self-improvement pass: for each recurring waste pattern with measured evidence, a
proposal in the right layer — a hook for mechanical repeatable checks, a skill for
a missing procedure, an agent change for the wrong worker on the work.

## After it returns

Read the report and relay two things plainly:

1. **Where the money went** — the measured breakdown, and what could not be
   measured and why. Lead with gaps; a confident number the agent could not
   actually measure is worse than a stated gap.
2. **Proposed self-improvements** — the hook / skill / agent proposals, each with
   the file it touches, the waste it prevents, the expected saving
   (measured or estimated), and its maintenance cost.

**Applying a proposal is the user's decision, not yours.** `kb-forensics` proposes
and never edits a hook, skill, agent, or setting. Present the proposals as choices;
if the user approves specific ones, then apply those edits yourself (or dispatch an
agent to), run `./validate.py`, and re-run `./install.sh` so the changes reach the
installed copy. Do not apply anything the user did not pick.

## Stop early when the audit is not worth it

On a single cheap session there is not enough signal — say it was too small to
audit and stop, rather than manufacturing findings. The cheapest token is the one
never spent, and that includes the tokens this audit costs. Auditing past spend
does not refund it; the entire value is in the proposals the user chooses to act
on.

<!-- BEGIN kb-guardrails (generated from guardrails/RUNTIME-POLICY.md — run ./sync-guardrails.py; do not edit here) -->
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
