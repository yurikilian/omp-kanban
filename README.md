# omp-kanban

A kanban development lifecycle for [omp](https://omp.sh), built as ten subagents
and one skill.

Hand it an issue or a specification document. It plans the work into user stories
with testable acceptance criteria, implements tasks in parallel with strict TDD,
runs them past two review agents that argue over IRC and apply the fixes they
agree on, verifies the whole thing end to end, and opens a pull request with
release notes and an AC-to-test traceability table.

## Install

```bash
git clone https://github.com/yurikilian/omp-kanban
cd omp-kanban
./install.sh
```

That installs to `~/.omp/agent/` for your user. To scope it to one repository
instead:

```bash
./install.sh --project    # installs into ./.omp
```

Other flags: `--dry-run` shows what would happen without writing, `--uninstall`
removes everything it installed, `--help` prints usage. Re-running is safe — it
only prompts if a file at the target differs from the copy in this repo.

Then open omp, run `/agents`, and confirm the ten `kb-*` agents resolved. `Ctrl+R`
inside that view reloads from disk after any edit.

## The board

| Column | Agent | Role | Runs |
|---|---|---|---|
| Intake | `kb-intake` | smol | 1 |
| Backlog | `kb-planner` | slow | 1, spec input only |
| Todo | `kb-decompose` | slow | 1 |
| In Progress | `kb-dev` | default | parallel per layer |
| In Review | `kb-review` + `kb-critic` | slow + default | 2, over IRC |
| QA | `kb-qa` | default | 1 |
| Done | `kb-release` | smol | 1 |
| Post-cycle | `kb-retro` | smol | 1, skipped when trivial |

`kb-forensics` sits outside the board. Dispatch it when you want to know where
your tokens went.

Models are set by role, not by name, so they resolve against whatever you are
authenticated for. `slow` is reserved for the three places where a wrong call
compounds across the whole cycle — planning, decomposition, and first-pass
review. Everything mechanical runs on `smol`.

## Usage

The skill is description-gated, so it triggers on intent rather than an explicit
name:

```
implement the auth spec in docs/auth.md
```
```
fix issue #412 and open a PR
```
```
use the kanban-cycle skill to plan this out
```

For a first run, try it on something small and let it stop at the intake
checkpoint. It asks before planning, and the intake pass is cheap.

Each run gets its own directory under `.kanban/runs/<timestamp>-<slug>/`, so
concurrent invocations never collide. Add `.kanban/` to your `.gitignore`.

## How the review works

Most of the design is conventional. The review column is not, so it is worth
explaining before you rely on it.

`kb-review` reads the diff and produces findings. `kb-critic` first forms its own
independent view — deliberately before reading those findings, because reading
them first anchors it — then challenges the reviewer's work over IRC. They argue
for at most two rounds, each conceding where the other is right. The critic then
reconciles the dispute into one verdict and **applies the surviving fixes
itself**.

That last part is the tradeoff. Collapsing arbitration and fixing into one agent
removes a round-trip and a whole agent's worth of tokens, but it means nobody
reviews the critic's fixes. `kb-critic` has guards against this — fix only what
survived reconciliation, write the failing test first, escalate rather than let a
fix grow — and the skill tells the orchestrator to flag it if `fixes_applied`
starts reaching well past the findings that motivated them.

It is a real trade, not a free win. If you would rather have the independent
arbiter back, split `kb-critic` into a ruling agent and a fixing agent; the
verdict schema already carries everything a separate fixer would need.

## Lean principles, as mechanism

Each of these changes a specific decision some agent makes, rather than sitting
in a doc nobody reads:

- **Small batches** — a task that cannot be described by one failing test gets
  split. `kb-planner` has no `L` estimate.
- **Build only what is asked for** — code no acceptance criterion requires is a
  reviewable defect category, not a style note. Both review agents hunt it.
- **Defer reversible decisions** — `kb-planner` records decisions with a trigger
  for when they must actually be made; `kb-decompose` refuses to write tasks that
  force them early.
- **Stop the line** — `kb-dev` reports pre-existing defects instead of fixing
  them drive-by, where a scoped review would never see the change.
- **Amplify learning** — `kb-critic` records root causes, `kb-qa` records escapes,
  `kb-retro` audits the cycle, and the PR body carries all of it to the humans who
  can act on it.
- **Optimize the whole** — every task passing its own tests says almost nothing
  about whether the system works, which is what `kb-qa` exists to check.

Concurrency is omp's job, not the skill's. `parallel_safe` in `kb-decompose` is
not a WIP limit — it is file-ownership analysis, marking tasks whose
`files_touched` overlap or that modify shared surface like routers, migrations,
and lockfiles. Worktree isolation does not prevent those from colliding at merge.

## Packaging

This ships as an omp extension. The manifest is a standard `package.json` with an
`omp` key:

```json
"omp": {
  "name": "omp-kanban",
  "description": "Kanban development lifecycle: ...",
  "extensions": []
}
```

`omp.extensions` is the only field omp reads — an array of `.ts`/`.js` entry
paths, each default-exporting a factory that receives `ExtensionAPI`. This
extension ships no factory: it is agents and a skill, and omp discovers those
**by directory name**, loading `agents/` and `skills/` as if you had placed them
under `~/.omp/agent/` yourself. The array stays present but empty because
`omp plugin install` expects the key.

Two things worth knowing if you fork this:

- Capability folders are convention, not manifest entries. Adding
  `"omp": { "agents": "./agents" }` does nothing — the key is not read, and it
  fails silently rather than erroring.
- Other keys resolve but are not wired to a runtime registry. A real plugin was
  broken for exactly this reason: it declared `omp.hooks`, the resolver returned
  the path, and nothing ever imported or executed it. `validate.py` warns on
  these.

Skills are discovered **non-recursively** — one directory deep under `skills/`.
`skills/kanban-cycle/SKILL.md` works; `skills/team/kanban-cycle/SKILL.md` would
not be found.

Install with `./install.sh` (copies into the documented `.omp` roots) or via
omp's plugin manager once published.

## Cost

This runs eight agents on a full spec cycle. That is deliberate — the separation
between the agent that writes code and the agents that try to break it is where
the value is — but it is not cheap, and on a small change it costs more than the
change is worth.

The skill knows this and will offer to run a reduced cycle (`kb-dev` plus the
review pair) when the work does not justify the full board. Take it up on that.

`kb-forensics` audits where your tokens actually went. It discovers the session
JSONL schema rather than assuming it, reports honestly when something is not
measurable, and ranks its recommendations by expected saving — role
reassignment first, since that is usually the largest lever.

One thing it will tell you itself: auditing past spend does not refund it. The
value is entirely in what you change afterward.

## Status

Agent frontmatter and the `package.json` manifest are validated against omp's
documented schemas by `./validate.py`, which runs in CI. The validator catches
the failure modes that fail *silently* at runtime — an agent name colliding with
one of omp's bundled agents, a manifest key that resolves but is never wired, an
`output` schema conflicting with a prose return instruction.

**Not yet exercised against a live omp install.** The subagent `output` schemas
are the most likely thing to need adjusting if omp validates them more strictly
than assumed. Run `omp -p '/extensions'` and `/agents` after installing to see
what actually resolved and from where.

Issues and PRs welcome.

## License

MIT
