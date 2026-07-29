# CLAUDE.md

**[AGENTS.md](./AGENTS.md) is the source of truth for this repository. Read it
before making changes.**

This file exists only to point there. It deliberately does not duplicate that
content — two copies of the same guidance drift apart, and then neither can be
trusted.

Everything below is here because getting it wrong is expensive and silent.

## Five things to know before touching anything

**The core is prose, not application code.** It ships ten omp subagent definitions
and two skills. Every `.md` file under `agents/` becomes a system prompt verbatim.
Rewording for style can change behavior. The one exception is `panel/` — a
vendored Next.js app launched by the `hooks/pre/kb-panel.ts` session-start hook.
The hook installs always; the app itself is opt-in — `--with-panel` runs
`npm install` and `next build` against it — and does not affect the agents or
skill.

**Agent names are load-bearing.** Never name an agent `designer`, `librarian`,
`reviewer`, `scout`, `sonic`, `task`, `explore`, `plan`, `oracle`, or
`quick_task` — those are omp's bundled agents, and a same-named file silently
overrides them with no error. Everything here is prefixed `kb-` for that reason.

**The shared guardrail block in every agent is generated.** It comes from
`guardrails/RUNTIME-POLICY.md` via `./sync-guardrails.py`. Editing the copy
inside an agent file is editing the wrong file — the next sync overwrites it, and
`validate.py` fails on the drift in the meantime.

**Run the validator and the tests before committing:**

```bash
./validate.py     # structure
./tests/run.sh    # behavior (runs the validator too)
```

The validator catches the failure modes that fail silently at runtime: name
collisions, manifest keys omp never reads, hooks bound to events omp does not
dispatch, `output` schemas conflicting with prose return instructions, agents the
skill dispatches that do not exist, guardrail blocks that have drifted.

**Edit the repo, not the installed copy.** `install.sh` copies definitions into
`~/.omp/agent/` or `.omp/`. Edits there are overwritten on the next install and
are not under version control. Change files here, then re-run `./install.sh`.

## Then read AGENTS.md

For the frontmatter schema, how omp discovers agents and skills, why the review
column has two agents instead of three, why `parallel_safe` is not a WIP limit,
and what the model roles cost — all of it is in
**[AGENTS.md](./AGENTS.md)**.

If this file and AGENTS.md ever disagree, AGENTS.md is right and this file needs
fixing.
