# AGENTS.md

Authoritative guide for agents working on this repository. If another file in
this repo contradicts this one, this one is right and the other should be fixed.

## What this repository is

`omp-kanban` is an [omp](https://omp.sh) extension. It ships ten subagent
definitions and two skills. `kanban-cycle` runs the development lifecycle —
intake → planning → decomposition → parallel TDD → two-agent review → QA → PR —
and `cost-forensics` is an off-board self-improvement pass that audits session
spend and proposes hook/skill/agent changes to prevent recurring waste.

**The lifecycle is prose, not application code.** The agents and skill are
Markdown definitions that become system prompts, plus tooling that installs and
validates them. There is nothing to compile in that core, no runtime, no tests of
the usual kind. The "source code" is prose, read by a model rather than a
compiler — which changes what "correct" means, as described under
[Editing agent definitions](#editing-agent-definitions).

**The one exception is `dashboard/`** — a vendored web app (Express server + React
UI) that reads `~/.omp/agent/sessions/` and shows session timelines, KPIs, and
plans. It is optional and opt-in: `./install.sh --with-dashboard` installs it and
a `session_start` hook that launches it. Nothing about the agents or skill depends
on it. See [Hooks and the dashboard](#hooks-and-the-dashboard).

## Layout

```
agents/               ten subagent definitions, one file per agent
skills/kanban-cycle/  SKILL.md — the lifecycle orchestrator
skills/cost-forensics/ SKILL.md — off-board spend audit + self-improvement pass
hooks/pre/            session_start hook that launches the dashboard (opt-in)
dashboard/            vendored web app (Express + React); built at install time
docs/                 kanban-flow.dot + rendered kanban-flow.png (README diagram)
install.sh            copies definitions into an omp discovery root
uninstall.sh          thin wrapper over `install.sh --uninstall`
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

**Hooks are discovered by directory too**, not by the `omp.hooks` manifest key
(that key resolves but is unwired — see below). `hooks/pre/*.ts` and
`hooks/post/*.ts` are loaded as extension modules; each default-exports a factory
that receives `HookAPI` and subscribes to lifecycle events with `pi.on(...)`.

## Agent frontmatter

Required: `name`, `description`. Everything else inherits from the parent session.

The schema below is taken from omp's own bundled agents in `~/.omp/agent/agents/`
(designer, librarian, reviewer, scout, sonic, task) — they are the ground truth
for the format, not this doc.

| Field | Notes |
|---|---|
| `name` | Must match the filename. omp resolves by this field, not the file. |
| `description` | What the parent reads when deciding whether to dispatch. |
| `tools` | YAML list of omp tool names: `read`, `write`, `edit`, `grep`, `glob`, `bash`, `lsp`, `web_search`, `ast_grep`, `yield`, `hub`. Restricts the child. Names like `search`, `find`, `irc`, `github` do **not** exist and fail silently. |
| `model` | A **list** of **roles**, each carrying an `@` sigil: `@smol`, `@default`, `@slow`, `@fast`, `@task`, `@designer`. Not a bare name, not a model id. |
| `spawns` | Which agents this child may spawn (list, or `"*"`). Defaults to none. |
| `thinkingLevel` | `minimal` \| `low` \| `medium` \| `high` \| `xhigh` \| `auto` |
| `output` | omp's **properties/optionalProperties DSL**, not JSON Schema. Each field carries `metadata.description`; scalars are `string`/`number`/`boolean`; `enum` lists choices; `elements` describes array items; required fields go under `properties`, the rest under `optionalProperties`. No top-level `type: object`/`required`. **Conflicts with prose return instructions — pick one.** |

Structured returns are delivered via the `yield` tool, so agents with an `output`
schema list `yield` in their `tools`. Inter-agent messaging (the review pair) is
the `hub` tool (`op: send`/`op: wait`, addressing peers by agent name) — omp has
no IRC.

### Two rules that fail silently

**Never name an agent after one of omp's bundled agents** — the exported set is
`designer`, `librarian`, `reviewer`, `scout`, `sonic`, `task`, plus `explore`,
`plan`, `oracle`, `quick_task`. A same-named file silently overrides omp's own
agent. This is why every agent here is prefixed `kb-`. `validate.py` errors on
collisions.

**Never give an agent both an `output` schema and a prose return instruction.**
The docs say pick one. Agents with `output` return structured objects the
orchestrator reads programmatically; agents without it return prose. Mixing them
produces unpredictable returns.

## The agents

| Agent | Role | Returns | Column |
|---|---|---|---|
| `kb-intake` | `@smol` | json | classify issue vs spec, scope, value hypothesis |
| `kb-planner` | `@slow` | prose | epics, stories, acceptance criteria |
| `kb-decompose` | `@slow` | json | tasks, file claims, dependency layers |
| `kb-dev` | `@default` | json | one task, strict red-green-refactor |
| `kb-review` | `@slow` | prose | first-pass findings |
| `kb-critic` | `@default` | json | challenge, reconcile, apply fixes |
| `kb-qa` | `@default` | json | full suite, e2e, Playwright scaffold |
| `kb-release` | `@smol` | json | merge, release notes, PR |
| `kb-retro` | `@smol` | prose | post-cycle waste audit |
| `kb-forensics` | `@smol` | prose | session cost audit (off-board) |

Roles are deliberate. `@slow` is reserved for the three places where a wrong call
compounds across the whole cycle — planning, decomposition, and first-pass
review. Everything mechanical is `@smol`. **Do not upgrade a role without a
reason you can state**; this is the largest cost lever in the system, and the
person running it is budget-constrained.

## Hooks and the dashboard

`hooks/pre/kb-dashboard.ts` is a `session_start` hook that launches the vendored
`dashboard/` app. It is not part of the board — it is infrastructure that happens
to ship alongside it, installed only with `./install.sh --with-dashboard`.

**The hook is a cross-session singleton launcher.** Its whole job is to guarantee
*one* dashboard across every omp session, never one-per-session:

- Shared state lives at `~/.omp/agent/dashboard/` — `state.json` (`{port, pid,
  startedAt}`) names the running daemon; `.lock` (a directory, created with atomic
  `mkdir`) guards two sessions racing to start it at the same instant.
- On `session_start` it checks liveness (recorded pid alive **and** `/health`
  answers). Live → reuse and print the URL. Not live → acquire the lock, pick a
  **random free port** (bind `:0`, read the assigned port), spawn the server
  **detached + `unref()`** so it outlives the session, publish `state.json`, print
  the URL.
- Everything is wrapped and time-boxed: a launcher failure must never block or
  break session start. If the dashboard was not installed (`--with-dashboard`
  skipped), the hook detects the missing build and silently no-ops.

**Consequences worth knowing.** The daemon is deliberately not tied to a session's
lifetime — it keeps running after the session ends; stop it via the pid in
`state.json`. Because it is a single shared process, it reflects one working
directory (the session that launched it) as "current" in `/api/projects`; the UI
lists every project regardless, so that is only a default, not a limitation.
`OMP_KANBAN_DASHBOARD_OPEN=1` additionally opens a browser tab on fresh start.

**`dashboard/` is vendored, built at install.** `node_modules/` and `web/dist/`
are git-ignored and produced by `--with-dashboard` (`npm install` in `server/` and
`web/`, then `npm run build`). The server has a native dependency
(`better-sqlite3`), which is why the dashboard is opt-in rather than part of the
light Markdown install. It persists to `~/.omp/agent/dashboard.db` and reads
`~/.omp/agent/sessions/` — both outside this repo.

**Not yet exercised against a live omp.** Three things to confirm on a real
install: the exact hook directory (`pre/` vs `post/` for `session_start`), that
omp's TS hook runtime exposes Node builtins and `import.meta.url`, and that
`pi.sendMessage`/`ctx` match `docs/hooks.md` for the installed omp version.

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
- **Keep output schemas lean.** Every required field is bookkeeping the model must
  produce on every run. Do not require a field the orchestrator can derive itself —
  especially counts (Anthropic's *Building Effective Agents* names "having to keep
  an accurate count" as ACI overhead to eliminate). `task_count` was dropped from
  `kb-decompose` for this reason (the orchestrator counts `layers`), and
  `suite_result` was made optional in `kb-dev` (`status` already signals green).

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
challenges them over the hub, then reconciles *and applies the fixes*. An earlier
design had a separate arbiter. Collapsing it removes an agent and a round-trip.

The risk this creates: the critic both rules on findings and fixes them, so its
fixes could ship unreviewed. Rather than reintroduce a third agent, the reviewer —
already live on the hub — verifies the critic's fixes in one closing round
before the verdict is final, checking each fix resolves its finding and did not
reach past it. The outcome is recorded in `reviewer_signoff`
(`confirmed`/`objected`/`unavailable`), which the orchestrator gates on. This
restores the independent check that evaluator-optimizer designs need (see
Anthropic's *Building Effective Agents*) without a third agent or a round-trip
back to a developer.

`kb-critic` keeps its own guards too — form an independent view before reading the
findings, fix only what survived reconciliation, write the failing test first,
escalate rather than let a fix grow. It is still a real trade: the sign-off is one
round, not a full second review, so the skill also flags `fixes_applied` reaching
well past the findings that motivated them. If you want a fully independent
arbiter back, split `kb-critic` in two; the verdict schema already carries what a
separate fixer would need.

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

- **Format verified, behavior unexercised.** The frontmatter format — `@`-role
  lists, tool names, the `output` DSL, `hub` messaging — was reconciled against
  omp's own bundled agents in `~/.omp/agent/agents/`, so it matches what omp
  emits. What has *not* been run against a live omp is the cycle itself: whether
  each agent does what its prompt says, and whether the `output` schemas round-trip
  through `yield` exactly as assumed.
- **The retrospective cannot save money on the cycle it audits.** That spend
  already happened; the value is entirely in changes it prompts. `kb-retro` is
  instructed to say this and to skip trivial cycles.
- **The full cycle is wrong for small work.** Eight agents on a one-line fix
  costs more than the fix. The skill picks a track at intake (`state.json.track`):
  the full board for specs and high-risk issues, a reduced track (decompose → dev →
  review pair → release, QA only when an AC needs e2e) as the default for low-risk
  issues. Escalating to the full board is the explicit choice; defaulting to fewer
  agents is the safe one.
