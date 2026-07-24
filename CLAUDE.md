# CLAUDE.md

**[AGENTS.md](./AGENTS.md) is the source of truth for this repository. Read it
before making changes.**

This file exists only to point there. It deliberately does not duplicate that
content — two copies of the same guidance drift apart, and then neither can be
trusted.

Everything below is here because getting it wrong is expensive and silent.

## Four things to know before touching anything

**This repo contains no application code.** It ships ten omp subagent definitions
and one skill. Every `.md` file under `agents/` becomes a system prompt verbatim.
Rewording for style can change behavior.

**Agent names are load-bearing.** Never name an agent `explore`, `plan`,
`designer`, `reviewer`, `librarian`, `oracle`, `task`, or `quick_task` — those
are omp's bundled agents, and a same-named file silently overrides them with no
error. Everything here is prefixed `kb-` for that reason.

**Run the validator before committing:**

```bash
./validate.py
```

It catches the failure modes that fail silently at runtime: name collisions,
manifest keys omp never reads, `output` schemas conflicting with prose return
instructions, agents the skill dispatches that do not exist.

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
