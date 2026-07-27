# Configuration and runtime guardrails

What bounds a kanban cycle, where each bound actually lives, and how to tune it.

The single most important thing on this page is the **Enforced by** column. A
limit written into an agent prompt is a request; a limit in code is a limit. This
document never claims the first is the second.

---

## Why these limits exist

One real cycle produced:

| | |
|---|---|
| Model calls | 2,435 succeeded, 38 failed |
| Accumulated tokens | 291,139,336 |
| Of which cache reads | 281,918,657 — **96.83%** |
| Largest single prompt | 301,267 tokens |
| Compaction events | **0** |
| Rounds in the longest workers | 100–170 each |
| Peak concurrent high-effort workers | 6 |

The failure was **provider usage-limit exhaustion**, not a context-window
overflow. The mechanism is worth stating precisely, because it decides which
knobs matter:

> A model call re-sends the conversation so far. A worker on its 150th round is
> paying for everything it has read 150 times. Cache reads make each resend
> cheap, not free — and quota is consumed either way. Run six such workers at
> once and you multiply that by six.

So the levers that matter are, in order: **how many sessions run at once**, **how
many rounds each makes**, and **how much each round carries**. Everything below
is one of those three.

When Anthropic began returning 429s, every worker failed over to the fallback
provider at the same moment and exhausted that too. After a reset, six workers
were launched again and reproduced the failure — which is why "do not start new
work during a rate-limit window" and "do not launch the same task twice" are now
enforced in code rather than requested in prose.

No raw forensic data or prompt content is reproduced here or anywhere in the repo.

---

## What enforces what

| Guardrail | Mechanism | Enforced by |
|---|---|---|
| Batch width ≤ 2 implementation workers | `hooks/pre/kb-guardrails.ts` blocks the `task` call | **extension, code** |
| Batch width ≤ 2 high-effort agents | same | **extension, code** |
| ≤ 4 board agents in flight at all | same | **extension, code** |
| 1 canary during provider recovery | same | **extension, code** |
| No dispatch while a provider window is open | same | **extension, code** |
| Same task never dispatched twice | same | **extension, code** |
| Assignment ≤ 20,000 chars | same | **extension, code** |
| Task packet contains only its own ACs | `kb_db.py packet` | **extension, code** |
| Oversized task detected | `kb_db.py get plan-check` | **extension, code** |
| Reviewer independence | `kb_db.py get findings` refuses to answer | **extension, code** |
| Deterministic finding dedup | `kb_db.py get findings --merged` | **extension, code** |
| Turn soft limit / hard stop | `task.softRequestBudget` | **omp core, configuration** |
| Concurrent subagents | `task.maxConcurrency` | **omp core, configuration** |
| Concurrent requests per provider | `providers.maxInFlightRequests` | **omp core, configuration** |
| Compaction | `compaction.*` | **omp core, configuration** |
| Tool output spill and truncation | `tools.artifact*` | **omp core, configuration** |
| Retry, `Retry-After`, provider failover | `retry.*` | **omp core** |
| One reviewer instead of two on a bounded low-risk change | `SKILL.md` step 5 | **agent instructions** |
| Empty batch `context` (it is duplicated per item, not shared) | `SKILL.md` step 4 | **agent instructions** |
| Bounded `hub wait` — one retry, then record and finish | `kb-review`, `kb-critic` | **agent instructions** |
| Session logs aggregated, never read whole | `kb-forensics` | **agent instructions** |
| Batch tool calls, read narrowly, diff over reread | `guardrails/RUNTIME-POLICY.md` | **agent instructions** |
| Focused tests before broad suites | agent prompts | **agent instructions** |
| Structured handoff at the soft limit | agent prompts | **agent instructions** |

Two things follow from this table that are easy to miss:

- **The extension gates dispatch, not model calls.** It cannot break a circuit
  around a provider request; it can refuse to start new sessions. That turns out
  to be the lever the incident needed, but it is not the same thing.
- **The core settings are not applied by installing this extension.** They are
  omp's own settings. Opting in is a separate, explicit step.

---

## omp core settings

Every key below is real, read out of the installed binary's settings registry
(v17.1.4). The full file, ready to use, is
[`guardrails/omp-config.recommended.yml`](../guardrails/omp-config.recommended.yml).

### Applying them

```bash
# Per run, reversible, changes nothing on disk:
omp --config ~/.omp/agent/omp-kanban-guardrails.yml

# Or permanently — backs up config.yml, adds only keys you do not already set:
./install.sh --apply-config
```

`--apply-config` never overwrites a value you have already chosen, and never runs
unless you pass it.

### Concurrency

| Key | omp default | Recommended | What it does |
|---|---|---|---|
| `task.maxConcurrency` | `32` | `2` | Maximum subagents running at once. |
| `providers.maxInFlightRequests` | unset (unlimited) | `{anthropic: 2, openai-codex: 1}` | Concurrent LLM requests per provider id, **shared across every local omp process using this config root**. |

`providers.maxInFlightRequests` is the only cap that spans processes. It is what
stops a batch from arriving at the fallback provider all at once, and it is worth
setting even if you change nothing else. Providers you do not list stay unlimited.

### Turn budget

| Key | omp default | Recommended | What it does |
|---|---|---|---|
| `task.softRequestBudget` | `200` | `40` | Assistant requests per subagent run. omp injects a wrap-up notice at this number and **force-stops at 1.5×** it. |
| `task.softRequestBudgetNotice` | `true` | `true` | Emit that one wrap-up notice. |
| `task.maxRuntimeMs` | `0` (off) | `1800000` | Wall-clock backstop per subagent, for provider-side stream hangs. |

`40` gives a soft limit of 40 rounds and a hard stop at 60 — the incident's
workers made 100–170. The hard stop is not configurable separately; it is always
1.5× the soft budget. The board's own agents are told what to do when they reach
the soft limit: land what is green and yield a structured handoff, because an
agent that hits the force-stop yields nothing at all.

### Compaction

| Key | omp default | Recommended | What it does |
|---|---|---|---|
| `compaction.enabled` | `true` | `true` | Compact automatically. |
| `compaction.strategy` | `snapcompact` | `snapcompact` | Archive history onto dense images the model reads back — no extra LLM call. |
| `compaction.thresholdTokens` | `-1` (use percent) | `100000` | Fixed token threshold. Overrides `thresholdPercent`. |
| `compaction.keepRecentTokens` | `20000` | `20000` | Recent context retained. |
| `compaction.midTurnEnabled` | `true` | `true` | Check thresholds at mid-turn tool-loop boundaries, not just between turns. |
| `compaction.supersedeReads` | `true` | `true` | Drop an older read of a file when it is read again. |

The incident recorded **zero** compaction events while prompts reached 301K
tokens, because the default threshold is reserve-and-percentage based and those
sessions never crossed it in the way it measures. A fixed `thresholdTokens`
triggers on the number that actually matters, whatever the model's window.

`midTurnEnabled` matters more than it looks: a long tool loop is exactly where a
session grows without ever reaching a turn boundary.

### Tool output

| Key | omp default | Recommended | What it does |
|---|---|---|---|
| `tools.artifactSpillThreshold` | `50` KB | `20` KB | Output above this is written to an artifact; only head+tail stay inline. |
| `tools.artifactHeadBytes` | `20` KB | `5` KB | Inline head. |
| `tools.artifactTailBytes` | `20` KB | `10` KB | Inline tail — where a stack trace lives. |
| `tools.artifactTailLines` | `500` | `250` | Line cap on the inline tail. |
| `tools.outputMaxColumns` | `768` | `512` | Per-line byte cap for streaming output and `read`. |

omp already does the right thing here — full output preserved on disk, explicit
truncation, head and tail retained. Lowering the thresholds is what makes the
agents' instruction to "return a summary and a log path" true rather than
aspirational. ~20KB is roughly 5K tokens.

### Retry and failover

| Key | omp default | Recommended | What it does |
|---|---|---|---|
| `retry.maxRetries` | `10` | `5` | Retry attempts on API errors. |
| `retry.maxDelayMs` | `300000` | `300000` | Fail fast rather than sleeping when the provider asks for longer than this. |
| `retry.modelFallback` | `true` | `true` | Allow recovery to switch to a configured fallback model. |
| `retry.fallbackChains` | `{}` | your own | Map roles or `provider/model` selectors to ordered fallbacks. |
| `retry.usageAwareFallback` | `false` | `true` | Prefer a same-provider account, then a fallback, *before* a hard usage limit. |
| `retry.usageReservePct` | `10` | `10` | Treat a coding-plan model as near its limit below this remaining percentage. |
| `retry.usageReservePolicy` | `confirm` | `confirm` | What to do when every same-provider account is inside the reserve. |
| `retry.fallbackRevertPolicy` | `cooldown-expiry` | `cooldown-expiry` | Return to the primary once its suppression window ends. |

`retry.maxDelayMs` deserves a note. Anthropic's rate-limit windows can run to
hours. Sleeping through one blocks the board with no signal, so failing fast at
five minutes and letting the extension's breaker pause dispatch is the better
shape: the board reports a deadline and preserves its worktrees instead of
hanging.

### Stuck sessions

| Key | omp default | Recommended | What it does |
|---|---|---|---|
| `model.toolCallLoopGuard.enabled` | `true` | `true` | Detect a subagent repeating the same tool call. |
| `model.toolCallLoopGuard.threshold` | omp's default | `4` | How many repeats before intervening. |
| `providers.streamFirstEventTimeoutSeconds` | `-1` (provider default) | `120` | Seconds to wait for the first stream event. |
| `providers.streamIdleTimeoutSeconds` | `-1` (provider default) | `300` | Seconds a stream may stay silent between events. |
| `irc.timeoutMs` | `120000` | `300000` | Timeout for `hub` waits. |
| `task.maxRuntimeMs` | `0` (off) | `1800000` | Last-resort wall-clock kill per subagent. |

**`irc.timeoutMs` is the one that bites this board.** The review pair talks over
the hub, and `hub wait` returns on timeout exactly as it does on a reply.
`kb-review` finishes its pass first and waits; `kb-critic` is still doing its own
independent pass, because it must record findings before it may read the
reviewer's. At omp's 2-minute default the reviewer times out before the exchange
ever opens, and the cycle records `reviewer_signoff: unavailable` for purely
ordering reasons — the PR ships as a draft with a gap that was never real.

Two changes fix it together: this value, and `kb-critic` sending an early ack
before its deep pass so the reviewer's first wait resolves quickly. Both agents
also bound their waits — one retry, then record and finish. A `wait` loop is a
stuck session that also spends money.

The stream watchdogs matter because `task.maxRuntimeMs` is a *30-minute*
backstop. Without explicit stream timeouts, a silently dead connection burns all
30 minutes before the normal abort path runs.

### Subagent tooling

| Key | omp default | Recommended | What it does |
|---|---|---|---|
| `task.enableLsp` | `false` | `false` | Whether subagents may use the `lsp` tool. |

Left at omp's default, deliberately — and the agents are written to match. `lsp`
was previously declared by `kb-dev` and `kb-critic` and named in kb-dev's prose
("use `lsp` for renames"), which **could never work**: `task.enableLsp` is off by
default, so the tool does not resolve in a subagent. `validate.py` passed it
because `lsp` is a real omp tool name — it is simply unavailable in that
position. Both agents now use `ast_grep`, which matches on syntax rather than
text and needs no such flag.

If you turn `enableLsp` on, add `lsp` back to those agents' `tools`. Declaring it
without the setting is the silent-failure case.

### Prewalk (opt-in, unmeasured)

| Key | omp default | Recommended | What it does |
|---|---|---|---|
| `task.agentPrewalk` | `{}` | *(commented out)* | Per-agent: start on the resolved model, hand off to a cheaper one at the first edit/write. |

Keyed by agent name. `"on"` targets the `@smol` role, `"off"` disables, any other
string names the target model or role. The equivalent agent-frontmatter field is
`prewalk: true` (same `@smol` default) or `prewalk: "<model-or-role>"`;
`validate.py` accepts both forms.

Potentially the largest remaining saving, because In Progress is the
highest-volume column — and shipped commented out, because on `kb-dev` the first
write is the first *test*, so enabling it runs almost the entire TDD loop on
`@smol`. That is a real quality risk nobody has measured. AGENTS.md's rule about
not changing a model role without a reason you can state applies in both
directions. Enable it, run one cycle, and compare the review findings before
leaving it on.

---

## Extension settings

The dispatch hook reads baked defaults, then
`~/.omp/agent/kanban-guardrails/config.json`, then `KB_GUARD_*` environment
variables (last wins). Malformed values are ignored rather than raised — a bad
override must not take the board down.

| Setting | Default | Env var | What it caps |
|---|---|---|---|
| `maxImplementationConcurrency` | `2` | `KB_GUARD_MAX_IMPLEMENTATION_CONCURRENCY` | Concurrent `kb-dev` workers. |
| `maxHighEffortConcurrency` | `2` | `KB_GUARD_MAX_HIGH_EFFORT_CONCURRENCY` | Concurrent `kb-planner`, `kb-decompose`, `kb-review`, `kb-critic`. |
| `maxRecoveryConcurrency` | `1` | `KB_GUARD_MAX_RECOVERY_CONCURRENCY` | Dispatches admitted while a provider is recovering. |
| `maxTotalConcurrency` | `4` | `KB_GUARD_MAX_TOTAL_CONCURRENCY` | Any `kb-*` agent, so no unlisted role fans out wide. |
| `maxPacketChars` | `20000` | `KB_GUARD_MAX_PACKET_CHARS` | Hard reject above this. |
| `warnPacketChars` | `12000` | `KB_GUARD_WARN_PACKET_CHARS` | Log-and-allow above this. |
| `staleMs` | `1800000` | `KB_GUARD_STALE_MS` | Age at which an in-flight entry is reaped. |
| `breakerBaseMs` | `60000` | `KB_GUARD_BREAKER_BASE_MS` | Backoff floor when a provider states no deadline. |
| `breakerMaxMs` | `900000` | `KB_GUARD_BREAKER_MAX_MS` | Backoff ceiling. |
| `jitterRatio` | `0.1` | `KB_GUARD_JITTER_RATIO` | Jitter on computed backoff. Never applied to a provider-stated deadline. |
| `eventLogMaxBytes` | `2097152` | `KB_GUARD_EVENT_LOG_MAX_BYTES` | Rotate `events.jsonl` past this. |

Turn the whole thing off without uninstalling: `KB_GUARD_DISABLED=1`.

### What the hook does and does not touch

It subscribes to `tool_call` and `tool_result`, and examines **only `task` calls
whose items name a `kb-*` agent**. A call with no such item returns before any
state is read. Every internal failure is caught and allows the call — a guardrail
that breaks a session is worse than one that misses.

---

## Task packets

A worker receives the output of `kb_db.py packet --task-id T1`, and not the
backlog, the plan, the full acceptance-criteria table, sibling tasks, or file
contents:

```jsonc
{
  "task": {
    "id": "T1",
    "title": "Reject expired session tokens",
    "objective": "what changes and why",
    "size": "small",
    "complexity": "low",
    "acceptanceCriteria": [
      { "id": "E1-S1-AC1", "given": "…", "when": "…", "then": "…" }
    ],
    "candidateFiles": ["src/auth/session.test.ts", "src/auth/session.ts"],
    "dependencies": [],
    "constraints": [
      "Create or modify only the files under candidateFiles; record anything else in boundary_violations rather than editing it."
    ],
    "validation": {
      "commands": ["npm test -- src/auth/session.test.ts"],
      "expectedResults": ["rejects expired token (unit) passes"]
    },
    "budgets": {
      "maxTurns": 40, "hardTurns": 60,
      "maxContextTokens": 80000, "maxToolOutputChars": 12000
    }
  },
  "meta": { "sizeChars": 703, "maxChars": 20000, "warnChars": 12000 }
}
```

`candidateFiles` are **paths**. The worker reads the ranges it needs. Shipping
file contents to every worker is what stops scaling first.

The command exits non-zero above `maxChars` (`--warn-only` overrides), and the
dispatch hook rejects an assignment past the same ceiling — so the two agree, and
an oversized packet fails at build time or at dispatch, never as a slow session.

## Oversized-task detection

`get plan-check` returns `oversized_tasks` alongside the existing checks. A task
is flagged when it claims more than 8 files, plans more than 8 tests, covers more
than 5 acceptance criteria, spans more than one story, estimates more than 8
files, or declares `size: large`. Every signal is derived from rows the decomposer
already writes, so there is no extra bookkeeping to get wrong.

The orchestrator will not fan out a layer containing one. This is the check that
stops "change 23 files and add 26 tests" from entering a normal worker batch.

## Worker results and handoffs

A completed worker writes its full record to the `progress` section and yields
only scalars — `task_id`, `status`, and the flags the orchestrator branches on.
Detail is queried, not returned.

A worker stopped by a turn budget, a context budget, or a rate limit does the
same thing with `status: "blocked"` and a `blocked_reason` that is a resume plan:
what is done, what remains, which files matter and why, what was tried and failed,
and the exact command to run next. The worktree and any uncommitted changes are
left in place. The conversation is never serialized into the handoff.

---

## Circuit breaker and failover

States, per provider:

```
CLOSED    -> dispatch proceeds at normal concurrency
OPEN      -> no new dispatch until the retry deadline
HALF_OPEN -> exactly one canary dispatch is admitted
```

- A normalized rate-limit result (`rate_limit_error`, HTTP 429, usage limit,
  `overloaded_error`) opens the breaker for the provider named in the error.
- `retry-after-ms`, `retry-after`, `x-ratelimit-reset`, and "try again in N
  minutes" are honored as stated. Jitter is **not** applied to a stated deadline.
- With no metadata, backoff is exponential from 60s, capped at 15 minutes, with
  10% jitter.
- While OPEN nothing new starts, and nothing polls — the deadline is a timestamp,
  not a retry loop.
- At the deadline, exactly one canary is admitted. Success closes the breaker and
  restores normal concurrency; failure re-opens it with the newest deadline and
  an incremented trip count.
- Each provider carries its own window; dispatch waits for the latest of them.

**On failover.** omp core owns provider selection via `retry.fallbackChains`.
This extension cannot choose a provider — what it does is refuse to start new
sessions while any provider is limited, and then admit one at a time. A six-wide
batch therefore cannot arrive at the fallback provider at once, whichever
provider core picks. Combined with `providers.maxInFlightRequests` on the
fallback, the fallback has its own independent budget.

---

## Telemetry

Two logs, deliberately narrow. Neither records prompts, assignments, tool output,
or credentials.

**Dispatch decisions** — `~/.omp/agent/kanban-guardrails/events.jsonl`, one JSON
object per line, rotated past 2MB:

```bash
tail -20 ~/.omp/agent/kanban-guardrails/events.jsonl | python3 -m json.tool --json-lines

# Only the blocks:
grep dispatch_blocked ~/.omp/agent/kanban-guardrails/events.jsonl

# Every breaker transition, with its deadline:
grep breaker_ ~/.omp/agent/kanban-guardrails/events.jsonl
```

Events: `dispatch_allowed` (width, agents, task ids, packet sizes, in-flight
after, canary flag), `dispatch_blocked` (code, reason, the counts that caused
it), `packet_large`, `breaker_open` (provider, trips, wait, whether the deadline
came from the provider or from backoff), `breaker_closed`, `dispatch_settled`.

Live state, including what is in flight right now:

```bash
python3 -m json.tool ~/.omp/agent/kanban-guardrails/guardrails.json
```

**Board events** — the `events` table in the run database:

```bash
python3 "$RUN_DIR/kb_db.py" get events
python3 "$RUN_DIR/kb_db.py" get events --kind infra_pause
python3 "$RUN_DIR/kb_db.py" get flow-metrics
```

---

## Tuning concurrency safely

Raise one number at a time, and watch `events.jsonl` between changes.

- **Raise `maxImplementationConcurrency` before anything else**, and only to 3.
  Its cost is linear in sessions; every other knob is cheaper to get wrong.
- **Do not raise `maxRecoveryConcurrency` above 1.** Its entire purpose is that a
  recovering provider sees one request. Raising it recreates the stampede.
- **Do not raise `maxHighEffortConcurrency` above 2.** Two is the review pair. A
  third high-effort agent has no role in this board.
- **Raise `task.softRequestBudget` only with evidence** that workers are being
  cut off mid-task — a `blocked` status whose reason is a resume plan rather than
  a real obstacle. Prefer smaller tasks; a worker needing 80 rounds usually means
  the decomposition was wrong.
- **`providers.maxInFlightRequests` should stay at or below your plan's real
  concurrency.** Raising it does not raise your quota.

If you are hitting the caps constantly, the tasks are too large. Look at
`get plan-check` before looking at this page.

---

## Migration notes

Nothing here breaks an existing install.

- **Existing run databases keep working.** `kb_db.py` migrates `tasks` on connect
  (`size`, `complexity`, `est_files`, `validation_cmd`, all nullable), guarded by
  `PRAGMA table_info` so it is idempotent. Existing rows are untouched. A task
  payload without the new fields still loads; the task is simply unsized, and
  `packet` returns an empty command list rather than failing.
- **Existing omp configs keep working.** No key is renamed or removed.
  `--apply-config` adds only keys you have not set.
- **The guardrails hook is installed by default**, because it is inert unless a
  `task` call names a `kb-*` agent. If it is unwelcome, `KB_GUARD_DISABLED=1`, or
  delete `~/.omp/agent/hooks/pre/kb-guardrails.ts`.
- **The board is narrower by default.** A layer that used to fan out five-wide
  now runs in three sequential batches of two. It is not slower in wall-clock
  terms as often as you would expect — the previous width was mostly spent
  waiting on retries.
- **`kb-critic` must record findings before reading the reviewer's.** If you have
  customized it, keep the `load` of its own findings ahead of the first
  `get findings --author reviewer`, or that read will fail.
- **New verbs and views:** `packet`, `get events`, `get findings --merged`, and
  `oversized_tasks` inside `get plan-check`. Nothing was removed.
