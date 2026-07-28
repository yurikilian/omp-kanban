---
name: cost-forensics
description: Audits omp session spend and proposes self-improvements to the board. Dispatches the kb-forensics agent to find where tokens and money actually went in a session or kanban run, then turns each recurring waste pattern into a concrete proposal — a new or modified hook, skill, or agent — ranked by expected saving. Use whenever the user says a session or cycle was expensive, asks where the spend went, wants to cut token usage, or asks the board to improve itself. Also use after a kanban cycle when the user wants a cost audit of the run, and this is what the OMP panel's Generate Audit action dispatches for one session at a time.
---

# Cost Forensics

Find where the money went, then propose how to stop it going there again. This
audits real session transcripts and returns both a cost breakdown and a ranked
set of proposals for new or modified hooks, skills, and agents. It does not
run as part of a kanban cycle.

You are reached two ways. **Off-board**, dispatched on its own when a user or
a post-cycle pass wants spend audited — you pick the target and the report
path yourself. **Panel-dispatched**, when the OMP panel's Generate Audit
action invokes you (its prompt names this skill directly) for a session the
user already picked — the audit id, the target, the bundle directory and the
pricing policy all arrive already decided; relay them unchanged.

You orchestrate either way. `kb-forensics` does the analysis and writes the
output — a report off-board, a bundle when panel-dispatched. You do not
measure costs or propose changes yourself, and you never dispatch anything but
`kb-forensics` to do it: **the panel reaches `kb-forensics` only through you,
never directly.**

## Before dispatching

**Panel-dispatched:** skip this section. The prompt already names the target
session, the audit id, the bundle directory and the pricing policy — use
exactly what it gave you and go straight to Dispatch below. Picking a target
or a path yourself would silently replace what the panel already decided.

**Off-board**, pick both yourself:

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

**Off-board:**

- the **report path** you chose (it writes exactly one file, there);
- the **audit target** — the session file(s) or `run_dir` to analyze, or
  "most recent sessions" if general;
- any **pricing** the user supplied (otherwise it reports tokens and says pricing
  was unavailable — it never recalls prices from memory).

**Panel-dispatched** — carry all four of these through unchanged; you are a
relay here, not a decision-maker:

- the **audit id**, and when it was created;
- the **target** — the one session transcript to analyze, with the fingerprint
  the job service already computed for it;
- the **bundle directory** — where it writes the full artifact bundle instead
  of a single report (see `panel/docs/audit-bundle.md` for what goes in it);
- the **pricing policy** — pricing to use, carried verbatim, or an explicit
  instruction to report token-only because none was supplied. Either way it
  never recalls a price from memory.

Either way, it discovers the session schema before parsing, measures what is
measurable, reports gaps honestly, ranks knob-level recommendations, and then
runs the self-improvement pass: for each recurring waste pattern with measured
evidence, a proposal in the right layer — a hook for mechanical repeatable
checks, a skill for a missing procedure, an agent change for the wrong worker
on the work. None of that changes by caller; only where the result goes does.

## After it returns

**Off-board** — read the report and relay two things plainly:

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

**Panel-dispatched** — there is no one here to relay to. Your run ends once
`kb-forensics` finishes writing the bundle; the panel discovers it from disk
on its own. Proposals in `audit.json` still reach a person, just later,
through the panel's UI, and the same rule holds there: nothing applies a
proposal automatically.

## Stop early when the audit is not worth it

**Off-board only** — on a single cheap session there is not enough signal, and
nobody has committed to auditing that exact one; say it was too small to audit
and stop before ever dispatching `kb-forensics`, rather than spending tokens to
manufacture findings. The cheapest token is the one never spent, and that
includes the tokens this audit costs. Auditing past spend does not refund it;
the entire value is in the proposals the user chooses to act on.

**Panel-dispatched never skips this way.** The user already chose this exact
session when they activated Generate Audit; second-guessing that by refusing
to dispatch would silently drop their request. Dispatch `kb-forensics` as
normal — if the session turns out too small, that is `kb-forensics`'s own
`insufficient_signal` outcome to reach, documented in `agents/kb-forensics.md`,
not yours to pre-empt.
