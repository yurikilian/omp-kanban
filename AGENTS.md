# AGENTS.md

Authoritative guide for agents working on this repository. If another file in
this repo contradicts this one, this one is right and the other should be fixed.

## What this repository is

`omp-kanban` is an [omp](https://omp.sh) extension. It ships ten subagent
definitions and one skill that together run a kanban development lifecycle:
intake → planning → decomposition → parallel TDD → two-agent review → QA → PR.

**This repository contains no application code.** Everything here is either a
Markdown definition that becomes an agent's system prompt, or tooling that
installs and validates those definitions. There is nothing to compile, no
runtime, no tests of the usual kind. The "source code" is prose, and it is read
by a model rather than a compiler — which changes what "correct" means, as
described under [Editing agent definitions](#editing-agent-definitions).

## Layout

```
agents/               ten subagent definitions, one file per agent
skills/kanban-cycle/  SKILL.md — the orchestrator
install.sh            copies definitions into an omp discovery root
validate.py           schema validation; run before every commit
package.json          omp extension manifest
.github/workflows/    CI: validate + installer smoke test
```

## How omp loads this

Two separate mechanisms, and conflating them causes real bugs.

**Capability discovery is by directory name.** omp scans for `agents/` and
`skills/` and loads what it finds. No manifest entry declares them. Adding
`"omp": { "agents": "./agents" }` does nothing at all — the key is not read, and
it fails silently rather than erroring.

**The manifest declares one thing only:** `omp.extensions`, an array of `.ts` or
`.js` entry paths, each default-exporting a factory that receives `ExtensionAPI`.
This extension has no factory, so the array is empty. It stays present because
`omp plugin install` expects the key.

Other keys under `omp` — `hooks`, `commands`, `tools` — resolve to a path but are
not wired to any runtime registry. A published plugin was broken for exactly this
reason: it declared `omp.hooks`, the resolver returned the path, and nothing ever
imported or executed it. No error was raised. `validate.py` warns on these keys
for that reason.

**Discovery roots**, first match by name wins:

```
.omp/agents/<name>.md          project
~/.omp/agent/agents/<name>.md  user
<plugin>/agents/<name>.md      plugin
<bundled>                      omp's own eight
```

**Skill discovery is non-recursive** — exactly one directory deep under
`skills/`. `skills/kanban-cycle/SKILL.md` is found; `skills/team/kanban/SKILL.md`
is not.

## Agent frontmatter

Required: `name`, `description`. Everything else inherits from the parent session.

| Field | Notes |
|---|---|
| `name` | Must match the filename. omp resolves by this field, not the file. |
| `description` | What the parent reads when deciding whether to dispatch. |
| `tools` | CSV or list. Restricts the child. `yield` is always added. |
| `model` | A **role**, not a model name: `smol`, `default`, `slow`, `plan`, `commit`. |
| `spawns` | Which agents this child may spawn. Defaults to none. |
| `thinkingLevel` | `minimal` \| `low` \| `medium` \| `high` \| `xhigh` |
| `output` | JSON schema for structured returns. **Conflicts with prose return instructions — pick one.** |

### Two rules that fail silently

**Never name an agent after one of omp's bundled eight** — `explore`, `plan`,
`designer`, `reviewer`, `librarian`, `oracle`, `task`, `quick_task`. A same-named
file silently overrides omp's own agent. This is why every agent here is prefixed
`kb-`. `validate.py` errors on collisions.

**Never give an agent both an `output` schema and a prose return instruction.**
The docs say pick one. Agents with `output` return structured objects the
orchestrator reads programmatically; agents without it return prose. Mixing them
produces unpredictable returns.

## The agents

| Agent | Role | Returns | Column |
|---|---|---|---|
| `kb-intake` | smol | json | classify issue vs spec, scope, value hypothesis |
| `kb-planner` | slow | prose | epics, stories, acceptance criteria |
| `kb-decompose` | slow | json | tasks, file claims, dependency layers |
| `kb-dev` | default | json | one task, strict red-green-refactor |
| `kb-review` | slow | prose | first-pass findings |
| `kb-critic` | default | json | challenge, reconcile, apply fixes |
| `kb-qa` | default | json | full suite, e2e, Playwright scaffold |
| `kb-release` | smol | json | merge, release notes, PR |
| `kb-retro` | smol | prose | post-cycle waste audit |
| `kb-forensics` | smol | prose | session cost audit (off-board) |

Roles are deliberate. `slow` is reserved for the three places where a wrong call
compounds across the whole cycle — planning, decomposition, and first-pass
review. Everything mechanical is `smol`. **Do not upgrade a role without a
reason you can state**; this is the largest cost lever in the system, and the
person running it is budget-constrained.

## Editing agent definitions

The body of each file becomes a system prompt verbatim. That has consequences
that do not apply to ordinary code:

- **Instructions are load-bearing prose.** Rewording for style can change
  behavior. If you are editing for clarity, keep the imperatives intact.
- **Explain the reasoning, not just the rule.** "Mark unsafe when in doubt"
  is weaker than the same rule with its asymmetry stated — a false safe corrupts
  a run, a false unsafe costs some wall-clock time. Agents follow rules they
  understand more reliably than rules they are merely given.
- **Do not add rules without evidence.** Every constraint costs tokens on every
  run and adds surface for misreading. If a rule cannot be tied to an observed
  failure, leave it out.
- **Keep handoff fields consistent.** One agent's `output` schema is the next
  agent's input. Changing a field name means changing it in the producer, every
  consumer, and the skill. `validate.py` does not catch this — check by hand.

## Before committing

```bash
./validate.py
```

Exits non-zero on error. It checks frontmatter against omp's schema, catches
bundled-name collisions, verifies `output`/prose exclusivity, validates the
manifest, confirms every agent the skill dispatches exists, and parses every
JSON example in every file.

CI runs the same validator plus an installer smoke test — real install, assert
ten agents present, uninstall, assert cleanup.

## Testing changes for real

The validator checks structure, not behavior. Nothing here has been exercised
against a live omp install, so structural validity is not evidence that an agent
does what its prompt says.

```bash
./install.sh --project     # scope to this repo, not your user config
omp -p '/agents'           # confirm the ten kb-* agents resolved and from where
omp -p '/extensions'       # confirm kanban-cycle loaded
```

Then run the cycle on something small and let it stop at the intake checkpoint.
Intake is cheap and it asks before planning.

## Design decisions worth preserving

These were chosen deliberately. Changing them is fine — reverting them by
accident is not.

**Two review agents, not three.** `kb-review` produces findings, `kb-critic`
challenges them over IRC, then reconciles *and applies the fixes*. An earlier
design had a separate arbiter. Collapsing it removes an agent and a round-trip.

The cost: nobody reviews the critic's fixes. `kb-critic` has guards — form an
independent view before reading the findings, fix only what survived
reconciliation, write the failing test first, escalate rather than let a fix grow
— and the skill tells the orchestrator to flag it if `fixes_applied` reaches well
past the findings that motivated them. It is a real trade, not a free win. If you
want the independent arbiter back, split `kb-critic` in two; the verdict schema
already carries what a separate fixer would need.

**`parallel_safe` is not a WIP limit.** omp owns concurrency and worktree
isolation. `parallel_safe` marks tasks whose `files_touched` overlap a sibling or
that modify shared surface — routers, migrations, lockfiles, barrel exports.
Worktree isolation does not stop those from colliding at merge. An earlier
version also capped concurrent agents at four; that was removed as duplicated
harness machinery.

**Run isolation.** Each cycle gets `.kanban/runs/<timestamp>-<slug>/`. Concurrent
invocations must not share state. Every agent receives `run_dir` in its
assignment and writes only beneath it.

**Lean principles as mechanism, not commentary.** Each one changes a specific
decision some agent makes: no `L` estimates in `kb-planner`; unrequired
complexity is a reviewable defect category, not a style note; `kb-dev` reports
pre-existing defects rather than fixing them drive-by; `kb-critic` and `kb-qa`
record root causes and escapes that reach the PR body. If you find a principle
stated but not enforced anywhere, that is a bug — either wire it into an agent's
behavior or delete it.

## Honest limitations

- **Unexercised against live omp.** The `output` schemas are the most likely
  thing to need adjusting if omp validates more strictly than assumed.
- **The retrospective cannot save money on the cycle it audits.** That spend
  already happened; the value is entirely in changes it prompts. `kb-retro` is
  instructed to say this and to skip trivial cycles.
- **The full cycle is wrong for small work.** Eight agents on a one-line fix
  costs more than the fix. The skill offers a reduced cycle; that offer is a
  feature, not a fallback.
