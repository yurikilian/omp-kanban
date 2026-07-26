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
*   **Circuit Breaker:** If a task fails, you may spawn exactly one retry. If the retry also fails or times out, you must immediately halt the kanban cycle and request manual intervention. Do not endlessly spawn retries.

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
any of it. omp handles concurrency and worktree isolation itself, so you are not
managing parallelism — you are managing whether work reaches Done.

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

**Create an isolated run directory.** Multiple invocations may run concurrently
against the same repository, so nothing is shared between them:

```bash
RUN_DIR=".kanban/runs/$(date +%Y%m%d-%H%M%S)-<slug>"
mkdir -p "$RUN_DIR"/{progress,review}
```

Every agent receives `run_dir` in its assignment and writes only beneath it. Add
`.kanban/` to `.gitignore` if not already present.

Initialize `<run_dir>/state.json`:

```json
{
  "run_dir": ".kanban/runs/20260723-104500-auth",
  "column": "intake",
  "track": null,
  "started_at": "<iso8601>",
  "base_branch": "<current branch>",
  "tasks": {},
  "rework_count": 0
}
```

`track` is set at intake (step 1) to `"full"` or `"reduced"` and read by later
columns to decide which agents run.

## The cycle

### 1. Intake

Dispatch `kb-intake` with the raw input and `run_dir`.

If `open_questions` contains anything that would materially change the design,
put it to the user before continuing. Answering it yourself defeats the point —
these are the ambiguities where guessing wrong wastes everything downstream.

If `suspected_waste` is non-empty, or `smallest_valuable_slice` is meaningfully
smaller than the request, put both to the user now. Cutting scope here costs one
message; cutting it after the code exists costs everything spent building it.
Present it as a choice, not a recommendation — they may have context for why the
larger scope is right.

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
choice; defaulting to fewer is the safe one. Write the choice to `state.json` as
`track: "full"` or `track: "reduced"` — later columns read it to decide whether QA
runs and what release expects.

### 2. Backlog (spec only)

Dispatch `kb-planner`.

Show the user the epic and story structure before proceeding. This is the
cheapest correction point in the cycle — a wrong story here becomes wrong tasks,
wrong tests, and a wrong PR.

### 3. Todo

Dispatch `kb-decompose`. It returns the layer plan directly.

Verify before fanning out:

- `ac_coverage_complete` is true. If not, send it back rather than proceeding
  with a known coverage hole.
- No task shares a layer with a dependency.
- No two `parallel_safe` tasks in a layer have overlapping `files_touched`. This
  check keeps the parallel phase from corrupting itself — verify it directly
  rather than trusting the flag.

### 4. In Progress — parallel fan-out

Process layers in order. Within a layer, dispatch `kb-dev` for all
`parallel_safe` tasks in **one `task` call with multiple entries**. omp fans them
into isolated worktrees and manages the concurrency; you do not batch or throttle
them yourself.

Run `parallel_safe: false` tasks serially afterward. That flag is not about
concurrency limits — it marks tasks whose `files_touched` overlap a sibling or
touch shared surface, and running those together produces merge conflicts no
amount of worktree isolation prevents.

Give each agent only its own task ID and the `run_dir`.

After each layer, read every returned object:

- `boundary_violations` non-empty → the `files_touched` prediction was wrong. Do
  not let the agent retry across the boundary. Re-plan: serialize the conflicting
  tasks into a later layer, or add a follow-up task owning the shared file.
- `status: "blocked"` → resolve or escalate. Never mark a blocked task done to
  keep things moving.
- `preexisting_defects` non-empty → the agent correctly stopped the line. Decide
  with the user whether it becomes its own task now or is recorded for later. Do
  not silently drop it; a defect found and forgotten is worse than one never
  found, because the finding cost was already paid.
- `decisions` and `surprises` → carry into the review agents' assignments. A
  reviewer who knows why a choice was made reviews the choice; one who does not
  re-litigates it, which is a rework loop spent on an answered question.

Do not advance while the current layer has blocked tasks — that accumulates work
in progress without delivering any of it.

### 5. In Review — two agents over the hub

Once the last layer is done and no task is blocked, set `column: "in_review"` in
`<run_dir>/state.json` before dispatching. Nothing upstream sets it — `kb-decompose`
leaves the board at `in_progress` and `kb-critic` advances it to `qa` — so without
this write an interrupt here resumes into the In Progress fan-out and re-runs it.

Dispatch `kb-review` and `kb-critic` **in the same `task` call** so both are live
on the hub at once. Give each the other's agent name so they can `hub send` to it.

They negotiate directly: the reviewer produces findings, the critic challenges
them with evidence, both concede where wrong, and the critic reconciles and
**applies the surviving fixes**. Then the reviewer verifies those fixes over the
hub before the verdict is finalized — an independent check on the fixer,
since the critic both rules and fixes. There is no separate arbiter and no
round-trip back to a developer.

Read the critic's returned verdict together with `reviewer_signoff`:

- `approved` / `approved_with_nits` **and** `reviewer_signoff: confirmed` → step 6
  on the full track, or step 7 on the reduced track (see the track choice in step 1).
- `reviewer_signoff: objected` → the independent check caught something in the
  critic's fixes. Read `reviewer_objections` and bring them to the user before
  advancing. If they choose to proceed, release opens the PR as a draft carrying
  the objections rather than shipping fixes the reviewer disputed.
- `reviewer_signoff: unavailable` → the fixes went unverified. Do not treat that as
  approval; surface it, and if the user proceeds, release drafts the PR with the
  gap noted.
- `escalate` → stop and bring it to the user with the critic's summary, then
  dispatch `kb-retro`. An escalated cycle is the most informative one available;
  let them decide with the diagnosis in hand.

The critic caps rework at 3. Respect that cap.

**The caveat this guards.** The critic both rules on findings and applies the
fixes, so its fixes need an independent set of eyes — that is what the reviewer's
sign-off provides. It is not a full second review; if you see `fixes_applied`
reaching well beyond the findings that motivated them even with a `confirmed`
sign-off, raise it with the user rather than proceeding.

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
flagged: carried nits, flaky tests, skipped e2e, uncovered ACs.

On merge conflicts, report the conflicting files and tasks rather than resolving
them — you have no basis for judging which side is correct.

Then dispatch `kb-retro` to audit the cycle. Give the user its cost summary and
recommendations. Applying them is their call, not yours.

Skip the retrospective on trivial cycles. On a one-task issue there is not enough
signal to justify the spawn, and running it anyway is exactly the waste it exists
to find.

## Keeping state truthful

Every agent reads and writes `<run_dir>/state.json`. After each column, verify it
reflects what actually happened. The board makes the cycle resumable and is what
the user reads to understand progress — a state file claiming "done" for a
blocked task converts a visible problem into an invisible one.

If the user interrupts and returns, read `state.json` first and resume from
`column` rather than restarting. Read `track` too: `kb-critic` sets `column: "qa"`
on approval regardless of track, so on the reduced track `column: "qa"` means
review is complete and QA is intentionally skipped — resume at step 7 (release),
not step 6.

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
| In Progress | `kb-dev` | `@default` | parallel per layer |
| In Review | `kb-review` + `kb-critic` | `@slow` + `@default` | 2, over the hub |
| QA | `kb-qa` | `@default` | 1 |
| Done | `kb-release` | `@smol` | 1 |
| Post-cycle | `kb-retro` | `@smol` | 1 (skip if trivial) |

`kb-forensics` is separate from the board — dispatch it when spend needs
auditing, not as part of a cycle.

## Run artifacts

```
.kanban/runs/<timestamp>-<slug>/
  state.json           orchestrator state, single source of truth
  intake.json          classification and scoping
  backlog.json         epics, stories, acceptance criteria
  todo.json            tasks, layers, parallel safety
  progress/<id>.json   per-task implementation report
  review/findings.json reviewer's first pass
  review/critique.json critic's independent pass
  review/verdict.json  reconciled verdict and applied fixes
  qa-report.json
  qa-e2e-results.json
  release.json
  retrospective.md
```
