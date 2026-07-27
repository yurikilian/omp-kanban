---
name: kanban-cycle
description: Runs a full kanban development lifecycle on an issue or specification — planning into user stories and acceptance criteria, parallel TDD implementation, two-agent review that negotiates over the hub and applies fixes, QA with e2e tests, and a pull request with release notes. Use whenever the user hands over a feature spec, requirements document, GitHub issue, bug report, or any description of work to be built and asks to implement it, build it, ship it, or run the board — even without saying "kanban". Also use when asked to plan work into tasks and then execute it, or to take work from description all the way to PR.
---

# Kanban Cycle

Move work from raw input to pull request across a board: Intake → Backlog → Todo
→ In Progress → In Review → QA → Done. Each column has dedicated subagents,
dispatched with `task`.

You orchestrate. You do not implement, review, or test the work yourself. The
value of this cycle comes from separation between the agent that writes code and
the agents that try to break it — fix a bug directly because it looks small and
you have collapsed that separation, leaving the review column verifying your work
with your own framing.

### Subagent Polling & Timeout Limits
*   **Maximum Polls:** You are strictly limited to a maximum of 3 `wait` polls per active subagent task.
*   **Timeout Cancellation:** If a subagent does not return a state update (e.g., "IN_PROGRESS" or "COMPLETED") after the 3rd poll, you must immediately cancel the stalled subagent task.
*   **Circuit Breaker:** If a task fails *on its own merits*, you may spawn exactly one retry. If the retry also fails or times out, halt the cycle and request manual intervention. Do not endlessly spawn retries.
*   **Infrastructure failures are not that.** A rate limit, a usage limit, or a blocked dispatch consumes no retry budget — there is nothing to retry, only a deadline to wait for. Retrying it immediately is what turned one 429 into an exhausted fallback provider. See "When a dispatch is blocked" below.
*   **Retries are safe.** A retried subagent is safe to re-dispatch: every `kb_db.py load` is idempotent on its natural key, so replaying a write does not duplicate or corrupt state.

## Operating principles

Lean, applied as mechanism rather than decoration. Each changes a specific
decision you will face.

**Small batches.** A task that cannot be described by one failing test is too
large. Large batches take longer to review, fail in harder-to-diagnose ways, and
hide defects behind volume. This is the lever that matters most upstream: task
size determines review quality, diagnosability, and how much has to be redone
when something is wrong.

**Finish before starting.** Complete a layer before dispatching the next.
Advancing while tasks are blocked accumulates work in progress without delivering
any of it. omp owns worktree isolation, but **you own batch width**: dispatch at
most two implementation workers at a time and let them finish. A wide fan-out
does not deliver a layer faster — every worker resends its whole growing session
on every model round, so six at once multiplies the cost of the same work and
exhausts the provider before the layer lands.

**Build only what is asked for.** Code no acceptance criterion requires is waste,
and the expensive kind — it must be reviewed, tested, and maintained, and the
next reader assumes it was needed. The review agents treat unrequired complexity
as a defect category. Back them when they do.

**Defer reversible decisions.** Commit at the last responsible moment, when the
information that should inform the decision has arrived.

**Stop the line.** A blocked task with a clear diagnosis is a good outcome.
Working around a known-wrong foundation is not; the cost surfaces later, when
undoing it is far more expensive.

**Amplify learning.** Rework loops and e2e failures carry information about where
the process leaks. `kb-critic` records root causes, `kb-qa` records escapes, and
`kb-retro` audits the whole cycle. Do not let these drop between columns — they
are the only thing making the next cycle cheaper than this one.

**Optimize the whole.** Every task passing its own tests tells you almost nothing
about whether the system works. That is what QA is for, and why you do not skip
it when the individual reports all look green.

## Before starting

Confirm a git repository with a clean working tree. If dirty, stop and ask — this
cycle creates and merges branches, and starting from uncommitted changes
entangles the user's work with the agents'.

**Create an isolated run directory — with an absolute path.** Multiple
invocations may run concurrently against the same repository, so nothing is
shared between them. `RUN_DIR` **must be absolute**: `kb-dev` fans out into
isolated git worktrees, and a relative path resolves to a different, empty
`kanban.db` in each one — every dev write would be silently lost with no error.

```bash
RUN_DIR="$(pwd)/.kanban/runs/$(date +%Y%m%d-%H%M%S)-<slug>"
mkdir -p "$RUN_DIR"
for c in "$HOME/.omp/agent/skills/kanban-cycle/kb_db.py" ".omp/skills/kanban-cycle/kb_db.py"; do
  [ -f "$c" ] && cp "$c" "$RUN_DIR/kb_db.py" && break
done
python3 "$RUN_DIR/kb_db.py" init --run-dir "$RUN_DIR" --base-branch "$(git branch --show-current)"
```

Every agent receives `run_dir` in its assignment and writes only beneath it —
and nothing else, since the database is the one thing keyed to that path. Add
`.kanban/` to `.gitignore` if not already present.

`init` seeds the `board` row (`board_column: "intake"`, `track: NULL`,
`rework_count: 0`, `qa_retries: 0`) and is idempotent — safe to re-run on
resume; it never resets progress already recorded. `track` is set at intake
(step 1) to `"full"` or `"reduced"` via `set board track=...` and read by
later columns via `get board` to decide which agents run.

## The run database

Every agent writes through the helper copied into `run_dir` above — never by
hand-editing `kanban.db` or writing JSON files:

```bash
python3 "$RUN_DIR/kb_db.py" load <<'JSON'
{"tasks": [...]}
JSON
python3 "$RUN_DIR/kb_db.py" set board board_column=todo
python3 "$RUN_DIR/kb_db.py" get task --id T1
```

Six verbs, all documented in the agent prompts that use them: `init` (above);
`load` — nested JSON on stdin or `--file`, applied in one transaction, keyed by
section (`board`, `intake`, `backlog`, `tasks`, `progress`, `review`,
`critique`, `qa`, `release`, `notes`, `events`); `set <entity> [<id>] k=v…` for
scalar mutations (`board`, `task`, `finding`, `story`, `defect`); `get <view>
[flags]` for named reads (`board`, `intake`, `backlog`, `acs`, `plan-check`,
`layer --n N`, `task --id T1`,
`findings [--author reviewer|critic] [--open] [--merged]`, `fixes`, `verdict`,
`qa`, `traceability --format md`, `flow-metrics`, `process-notes`,
`events [--kind K]`, `tables`); `packet --task-id T1` for the compact worker
assignment; and `sql "<SELECT…>"` as a read-only escape hatch. No `--db` flag
ever appears in an agent assignment — the helper defaults to the copy sitting
beside it in `run_dir`.

Agents receive only `run_dir` and their own task ID or scope; they discover
everything else — the backlog, their task's claimed files, prior findings —
through these commands rather than being handed it in their prompt. This also
enforces boundaries structurally: `get task --id T1` returns only that task,
so "do not read sibling tasks" is a property of the query, not just an
instruction.

## The cycle

### 1. Intake

Dispatch `kb-intake` with the raw input and `run_dir`. It returns `kind`,
`risk_level`, `open_questions_count`, `suspected_waste_count`, and
`scope_reduction_suggested` — the detail behind each lives in the database.

If `open_questions_count` is non-zero, run `python3 "$RUN_DIR/kb_db.py" get
intake` (open questions are `notes` rows with `kind: "open_question"`) and put
anything that would materially change the design to the user before
continuing. Answering it yourself defeats the point — these are the
ambiguities where guessing wrong wastes everything downstream.

If `suspected_waste_count` is non-zero or `scope_reduction_suggested` is true,
pull the detail the same way (`get intake` plus `sql "SELECT * FROM
intake_suspected_waste"`) and put both to the user now. Cutting scope here
costs one message; cutting it after the code exists costs everything spent
building it. Present it as a choice, not a recommendation — they may have
context for why the larger scope is right.

**Choose the track — default to the smallest cycle the work justifies.** The full
eight-agent board is not the default for everything; running it on a small change
costs more than the change is worth. Decide from intake's `kind` and `risk.level`:

- `kind: spec` → **full track**. Go to step 2.
- `kind: issue`, `risk.level: high` → **full track**. Skip planning (step 2), go to
  step 3 and run every column through retrospective.
- `kind: issue`, `risk.level: low` or `medium` → **reduced track** (default):
  step 3 (decompose) → step 4 (dev) → step 5 (review pair) → step 7 (release).
  Skip QA (step 6) unless an acceptance criterion needs real end-to-end wiring to
  verify, and skip the retrospective. This is the honest default for a bounded
  change — the review pair still gives you the write/break separation that is the
  point of the cycle.

State the track you chose and why in one line, and let the user upgrade to the
full board if they want the extra rigor. Escalating to more agents is the explicit
choice; defaulting to fewer is the safe one. Write the choice:
`python3 "$RUN_DIR/kb_db.py" set board track=full` (or `track=reduced`) —
later columns read it via `get board` to decide whether QA runs and what
release expects.

### 2. Backlog (spec only)

Dispatch `kb-planner`, looping while its `more_epics_pending` return is true.

Show the user the epic and story structure before proceeding —
`python3 "$RUN_DIR/kb_db.py" get backlog`. This is the cheapest correction
point in the cycle — a wrong story here becomes wrong tasks, wrong tests, and a
wrong PR.

### 3. Todo

Dispatch `kb-decompose`. It returns only `ac_coverage_complete` and, if false,
`uncovered_ac` — the layer plan itself lives in the database.

Verify before fanning out:

- `ac_coverage_complete` is true. If not, send it back rather than proceeding
  with a known coverage hole.
- `python3 "$RUN_DIR/kb_db.py" get plan-check` returns empty
  `layer_dep_violations`, empty `parallel_file_conflicts`, and empty
  `oversized_tasks`. The first two are the same checks as before — no task
  shares a layer with a dependency, and no two `parallel_safe` tasks in a layer
  share a claimed file — now queries instead of manual verification, so they
  can't be skipped by mistake.

  `oversized_tasks` is the new one, and it is not advisory. It flags a task
  claiming more than 8 files, planning more than 8 tests, covering more than 5
  acceptance criteria, spanning more than one story, or declared `size: large`.
  A task like that is a project: it cannot be finished inside one bounded
  session, it is unreviewable as a single diff, and when it fails you cannot
  tell which of its outcomes failed. Send it back to `kb-decompose` to split.
  Do not fan it out and hope.

### 4. In Progress — parallel fan-out

For each layer, `python3 "$RUN_DIR/kb_db.py" get layer --n <N>` returns the
task IDs in that layer, ordered parallel-safe first.

**Dispatch in batches of at most two.** Take the first two `parallel_safe` tasks
in one `task` call, wait for both to report, then take the next two. omp fans
each batch into isolated worktrees. It does not cap the width for you — its
`task.maxConcurrency` default is 32 — so the width you ask for is the width you
get, and a six-wide layer is six sessions each resending its full history every
round. Two is the configured cap; the guardrails hook blocks a wider batch
outright rather than letting it through.

Run `parallel_safe: false` tasks serially afterward. That flag is not about
concurrency limits — it marks tasks whose claimed files overlap a sibling or
touch shared surface, and running those together produces merge conflicts no
amount of worktree isolation prevents.

**Send a task packet, not a briefing.** Each worker gets its `run_dir` and

```bash
python3 "$RUN_DIR/kb_db.py" packet --task-id T1
```

which returns that task's objective, **only its own** acceptance criteria,
claimed file paths, dependencies, constraints, one validation command, and its
budgets. Do not paste the backlog, the acceptance-criteria table, the plan, or
file contents into an assignment.

**Leave the batch call's shared `context` empty.** omp prepends it to *every*
item's assignment, so it is duplication, not sharing — a paragraph there is paid
for once per worker, and two workers make it twice as expensive as putting it in
one prompt. Everything a worker needs is already in its packet. The command exits non-zero above 20,000
characters, and the hook rejects an assignment past the same ceiling, so an
oversized packet fails at dispatch rather than becoming an expensive session.

After each layer, read every returned object — each `kb-dev` now yields only
`task_id`, `status`, and the booleans below; pull detail from the database when
one fires:

- `has_boundary_violations` true → `sql "SELECT path, needed_for FROM
  boundary_violations WHERE task_id='T1'"`. The claimed-files prediction was
  wrong. Do not let the agent retry across the boundary. Re-plan: serialize the
  conflicting tasks into a later layer, or add a follow-up task owning the
  shared file.
- `status: "blocked"` → read the returned `blocked_reason`, then resolve or
  escalate. Never mark a blocked task done to keep things moving.
- `has_preexisting_defects` true → `sql "SELECT location, evidence FROM
  defects WHERE task_id='T1'"`. The agent correctly stopped the line. Decide
  with the user whether it becomes its own task now or is recorded for later.
  Do not silently drop it; a defect found and forgotten is worse than one never
  found, because the finding cost was already paid.
- `sql "SELECT * FROM decisions WHERE task_id='T1'"` and the task's `notes`
  (kind `surprise`) → carry into the review agents' assignments. A reviewer who
  knows why a choice was made reviews the choice; one who does not re-litigates
  it, which is a rework loop spent on an answered question.

Do not advance while the current layer has blocked tasks — that accumulates work
in progress without delivering any of it.

**Reconcile before calling the layer done.** Every task you dispatched must have
a row you can read back: `sql "SELECT task_id, status FROM tasks WHERE layer=N"`.
A worker that returned nothing, returned an empty object, or was cut short is
**not** done — treat it as `blocked` and resolve it. An empty result read as
success is how a layer gets declared complete with work missing, and the gap
does not surface until review or QA, by which time everything built on top of it
is suspect.

## When a dispatch is blocked

The guardrails hook refuses a `task` call rather than letting it run, and says
why in the error. None of these mean the plan is wrong:

- `concurrency_implementation` / `concurrency_high_effort` / `concurrency_total`
  — the batch is too wide. Re-dispatch the number it names.
- `packet_oversize` — the assignment is carrying documents. Send the packet.
- `duplicate_dispatch` — that task is already running. **Do not launch it
  again.** Wait for the running one. This is the retry stampede guard; a second
  worker on the same task duplicates side effects and produces two branches.
- `breaker_open` / `canary_in_flight` / `recovery_concurrency` — a provider is
  rate limited.

**A rate limit is an infrastructure pause, not a failure.** Say so to the user,
with the deadline from the message. Then:

1. Leave every worktree and uncommitted change exactly as it is. Nothing is
   reverted, nothing is cleaned up.
2. Record the pause: `python3 "$RUN_DIR/kb_db.py" load` with an `events` entry
   (`{"events":[{"kind":"infra_pause","body":{"until":"…","column":"in_progress"}}]}`).
3. When the deadline passes, dispatch **one** task — the canary. If it returns
   normally, resume normal two-wide batches. If it is blocked again, the breaker
   re-opened with a new deadline; wait again.
4. Never re-plan, never restart a task that already reported, never re-run a
   completed merge or commit. Resume is from the board, and every `load` is
   idempotent on its natural key, so a replayed write is safe — a replayed
   *dispatch* is not.

### 5. In Review — two agents over the hub

Once the last layer is done and no task is blocked,
`python3 "$RUN_DIR/kb_db.py" set board board_column=in_review` before
dispatching. Nothing upstream sets it — `kb-decompose` leaves the board at
`in_progress` and `kb-critic` advances it to `qa` — so without this write an
interrupt here resumes into the In Progress fan-out and re-runs it.

**Does this change need two reviewers?** The pair is the right default, but it is
also two of the most expensive agents on the board, and running it on a one-line
fix is the same waste as running eight agents on a typo. Drop to `kb-critic`
alone — no hub, no pair — when *all* of these hold:

- the track is `reduced` (from `get board`),
- intake recorded `risk_level: low`,
- the cycle produced one or two tasks,
- no task reported a boundary violation or a pre-existing defect.

`kb-critic` alone still reviews and still applies fixes; what you give up is the
second independent opinion, which on a bounded low-risk change is worth less than
it costs. Anything else — any spec, any high-risk issue, any multi-task layer,
any surprise reported from In Progress — runs the pair. Say in one line which you
chose and why. Escalating to the pair is the explicit choice; it is also the one
to make whenever the answer is not obvious.

For the pair, dispatch `kb-review` and `kb-critic` **in the same `task` call** so
both are live on the hub at once. Give each the other's agent name so they can
`hub send` to it.

They negotiate directly: the reviewer produces findings, the critic challenges
them with evidence, both concede where wrong, and the critic reconciles and
**applies the surviving fixes**. Then the reviewer verifies those fixes over the
hub before the verdict is finalized — an independent check on the fixer,
since the critic both rules and fixes. There is no separate arbiter and no
round-trip back to a developer.

Independence is enforced, not requested: `get findings --author reviewer` and
`get findings --merged` both fail until the critic has recorded findings of its
own. Two reviewers are only worth two reviewers if the second one formed a view
before reading the first's, and under time pressure that is exactly the step a
model skips. Consolidation reads `get findings --merged`, which deduplicates the
two sets deterministically — a defect both reviewers found is one row carrying
both authors, which is also the strongest signal of what to fix first.

Give each reviewer the diff, the changed-file list, the relevant acceptance
criteria, and the test summary. Not the developers' sessions. A worker
transcript is the largest artifact in the cycle and the least useful input to a
review — the diff is what shipped.

Read the critic's returned verdict together with `reviewer_signoff`:

- `approved` / `approved_with_nits` **and** `reviewer_signoff: confirmed` → step 6
  on the full track, or step 7 on the reduced track (see the track choice in step 1).
- `reviewer_signoff: objected` → the independent check caught something in the
  critic's fixes. Pull the detail with `python3 "$RUN_DIR/kb_db.py" get
  process-notes` (or `sql "SELECT * FROM notes WHERE kind='reviewer_objection'"`)
  and bring them to the user before advancing. If they choose to proceed,
  release opens the PR as a draft carrying the objections rather than shipping
  fixes the reviewer disputed.
- `reviewer_signoff: unavailable` → the fixes went unverified. Do not treat that as
  approval; surface it, and if the user proceeds, release drafts the PR with the
  gap noted.
- `escalate` → stop and bring it to the user with the critic's summary, then
  dispatch `kb-retro`. An escalated cycle is the most informative one available;
  let them decide with the diagnosis in hand.

The critic caps rework at 3. Respect that cap.

**The caveat this guards.** The critic both rules on findings and applies the
fixes, so its fixes need an independent set of eyes — that is what the reviewer's
sign-off provides. It is not a full second review; if `python3
"$RUN_DIR/kb_db.py" get fixes` shows fixes reaching well beyond the findings
that motivated them even with a `confirmed` sign-off, raise it with the user
rather than proceeding.

### 6. QA

**Full track only.** On the reduced track QA was skipped at intake unless an
acceptance criterion needs real end-to-end wiring — go straight to step 7, and
`kb-release` opens a draft noting QA was not run. If you do want QA on a reduced
cycle (an AC needs e2e), run it here as below.

Dispatch `kb-qa`.

- `verdict: "pass"` → step 7
- `verdict: "fail"` → dispatch `kb-critic` again with the QA report to fix, then
  return here. Cap at 2 QA retries, then escalate.

If `e2e_skipped`, tell the user why before continuing. They may be able to supply
the missing start command, which is worth more than shipping unverified.

### 7. Done

Dispatch `kb-release`. Give the user the PR URL, release notes, and anything
flagged — pull carried nits, flaky tests, skipped e2e, and uncovered ACs with
`python3 "$RUN_DIR/kb_db.py" get process-notes` and `get traceability
--format md`.

On merge conflicts, report the conflicting files and tasks rather than resolving
them — you have no basis for judging which side is correct.

Then dispatch `kb-retro` to audit the cycle. Give the user its cost summary and
recommendations. Applying them is their call, not yours.

Skip the retrospective on trivial cycles. On a one-task issue there is not enough
signal to justify the spawn, and running it anyway is exactly the waste it exists
to find.

## Keeping state truthful

Every agent reads and writes the run database through `kb_db.py`. Because
every `load` is one transaction, a half-written column is impossible — a run
either reflects the last completed write or it doesn't, never something in
between. The board makes the cycle resumable and is what the user reads to
understand progress — a `board_column` claiming "done" for a blocked task
converts a visible problem into an invisible one, so verify it after each
column.

If the user interrupts and returns, `python3 "$RUN_DIR/kb_db.py" get board`
first and resume from `board_column` rather than restarting. Read `track` too:
`kb-critic` sets `board_column: "qa"` on approval regardless of track, so on
the reduced track `board_column: "qa"` means review is complete and QA is
intentionally skipped — resume at step 7 (release), not step 6.

## Reporting

Report at column boundaries, not on every agent completion — a wall of
intermediate output buries the decisions needing attention.

Each boundary: the column completed, the counts that matter, and anything needing
a decision. Surface bad news early and plainly. A blocked task, an uncovered AC,
or a rework loop is normal operation — but only if the user hears about it when
it happens.

## Scaling down

Not everything needs eight agents, which is why the reduced track (see step 1) is
the **default** for low-risk issues rather than something offered after the fact.
The full board is reserved for specs and high-risk issues, where a wrong call
compounds across the whole cycle. For a one-line fix, a typo, or a config change,
drop further still — `kb-dev` plus the review pair is enough, and say so. The user
asked for a lifecycle because they want rigor; the honest version starts with the
least rigor the work justifies and escalates only on evidence it is needed.

## Agents

| Column | Agent | Role | Concurrency |
|---|---|---|---|
| Intake | `kb-intake` | `@smol` | 1 |
| Backlog | `kb-planner` | `@slow` | 1 (spec only) |
| Todo | `kb-decompose` | `@slow` | 1 |
| In Progress | `kb-dev` | `@default` | **2 per batch**, batches run in sequence |
| In Review | `kb-review` + `kb-critic` | `@slow` + `@default` | 2, over the hub — one bounded pair |
| QA | `kb-qa` | `@default` | 1 |
| Done | `kb-release` | `@smol` | 1 |
| Post-cycle | `kb-retro` | `@smol` | 1 (skip if trivial) |
| — | during provider recovery | — | **1 canary**, whatever the column |

The In Progress and In Review numbers are enforced in code by the guardrails
hook, counted across the whole workflow rather than per parent. See
`docs/CONFIGURATION.md` for what is enforced where, and how to tune it.

`kb-forensics` is separate from the board — dispatch it when spend needs
auditing, not as part of a cycle.

## Run artifacts

```
.kanban/runs/<timestamp>-<slug>/
  kanban.db            all board state — query with kb_db.py, never edit by hand
  kb_db.py             the helper, copied here at run start
  qa-e2e-results.json  raw Playwright json-reporter output
  release-notes.md
  retrospective.md
```

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
