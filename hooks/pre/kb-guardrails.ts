// omp-kanban — tool_call/tool_result hook: the board's dispatch guardrails.
//
// Why this exists. One real cycle spent 291M accumulated tokens across 2,435 model
// calls, 96.83% of them cache reads, with zero compactions and prompts reaching 301K
// tokens. Six high-effort workers ran at once; when Anthropic returned 429s the whole
// batch failed over to the fallback provider simultaneously and exhausted that too, and
// the retry relaunched all six. Nothing bounded batch width, packet size, or dispatch
// during a rate-limit window.
//
// This extension owns no model-call path, so it cannot break a circuit around a provider
// request — omp core already parses retry-after/x-ratelimit-* and owns retry.fallbackChains.
// What it CAN do is refuse to start new work. omp's HookToolWrapper throws whatever a
// `tool_call` handler returns as `{block, reason}` instead of running the tool, so a
// dispatch gate here is genuine code-level enforcement, not prompt policy. That is the
// lever the incident actually needed: the damage came from starting six sessions, not
// from any single request.
//
// Scope. Only `task` calls that spawn `kb-*` agents are examined. Every other tool call,
// and every session that is not running the board, passes through untouched — so this
// cannot wedge unrelated work. Any internal failure fails OPEN (allow, log, continue),
// matching kb-panel.ts's rule that a hook must never break a session.
//
// State is shared across sessions at ~/.omp/agent/kanban-guardrails/ because concurrency
// has to be counted across the whole workflow, not independently inside each parent agent.
//
// Discovery: omp loads hooks/pre/*.ts as extension modules; this default export receives
// the HookAPI. The type import is erased at runtime.
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ------------------------------------------------------------------ contracts

export interface GuardConfig {
  /** Concurrent `kb-dev` workers. The incident ran six. */
  maxImplementationConcurrency: number;
  /** Concurrent high-effort agents (the `@slow` / thinkingLevel-high set). */
  maxHighEffortConcurrency: number;
  /** Dispatches admitted while a provider is recovering. Exactly one canary. */
  maxRecoveryConcurrency: number;
  /** Ceiling across every kb-* agent, so no unlisted role can fan out wide. */
  maxTotalConcurrency: number;
  /** Hard reject above this; a task packet this large is carrying documents. */
  maxPacketChars: number;
  /** Warn (allow) above this. */
  warnPacketChars: number;
  /** In-flight entries older than this are reaped, so a crash cannot wedge dispatch. */
  staleMs: number;
  /** Backoff floor when a provider gives no retry metadata. */
  breakerBaseMs: number;
  /** Backoff ceiling. */
  breakerMaxMs: number;
  /** Jitter applied to computed backoff only — never to a provider-supplied deadline. */
  jitterRatio: number;
  /** events.jsonl is rotated past this. */
  eventLogMaxBytes: number;
}

export const DEFAULTS: GuardConfig = {
  maxImplementationConcurrency: 2,
  maxHighEffortConcurrency: 2,
  maxRecoveryConcurrency: 1,
  maxTotalConcurrency: 4,
  maxPacketChars: 20000,
  warnPacketChars: 12000,
  staleMs: 30 * 60 * 1000,
  breakerBaseMs: 60 * 1000,
  breakerMaxMs: 15 * 60 * 1000,
  jitterRatio: 0.1,
  eventLogMaxBytes: 2 * 1024 * 1024,
};

/** thinkingLevel: high and/or the `@slow` role — the expensive half of the board. */
export const HIGH_EFFORT_AGENTS = new Set([
  "kb-planner",
  "kb-decompose",
  "kb-review",
  "kb-critic",
]);

/** The parallel fan-out column. */
export const IMPLEMENTATION_AGENTS = new Set(["kb-dev"]);

export interface DispatchItem {
  agent: string;
  /** Task id parsed out of the assignment, when the assignment names one. */
  taskId: string | null;
  /** Assignment size including any shared batch context prepended to it. */
  promptChars: number;
}

export interface Dispatch {
  toolCallId: string;
  items: DispatchItem[];
}

export interface InFlight {
  toolCallId: string;
  agent: string;
  taskId: string | null;
  startedAt: number;
  canary: boolean;
}

export interface Breaker {
  /** "closed" | "open" — "half_open" is derived from the deadline, never stored. */
  state: string;
  openedAt: number;
  /** Epoch ms before which no new dispatch is admitted. */
  retryAfter: number;
  /** Consecutive trips, driving bounded exponential backoff. */
  trips: number;
}

export interface GuardState {
  version: number;
  inflight: InFlight[];
  breakers: Record<string, Breaker>;
}

export interface GuardEvent {
  ts: string;
  event: string;
  [key: string]: unknown;
}

export interface Decision {
  allow: boolean;
  /** Machine-readable cause; the human sentence is in `reason`. */
  code: string | null;
  reason: string | null;
  state: GuardState;
  events: GuardEvent[];
}

export function emptyState(): GuardState {
  return { version: 1, inflight: [], breakers: {} };
}

// -------------------------------------------------------------------- config

function num(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Baked defaults, overridden by ~/.omp/agent/kanban-guardrails/config.json, overridden
 * by KB_GUARD_* environment variables. Unknown keys and unparseable values are ignored
 * rather than throwing — a malformed override must not take the board down.
 */
export function resolveConfig(
  fileConfig: Partial<GuardConfig> | null,
  env: Record<string, string | undefined>,
): GuardConfig {
  const merged: GuardConfig = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof GuardConfig)[]) {
    const fromFile = fileConfig?.[key];
    if (typeof fromFile === "number" && Number.isFinite(fromFile) && fromFile >= 0) {
      merged[key] = fromFile;
    }
    const envKey = "KB_GUARD_" + key.replace(/([A-Z])/g, "_$1").toUpperCase();
    merged[key] = num(env[envKey], merged[key]);
  }
  return merged;
}

// ------------------------------------------------------------- input parsing

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Reads both `task` tool shapes: the batch form `{ context, tasks[] }` (task.batch,
 * omp's default) and the flat single-spawn form `{ prompt, agent }`. Shared batch
 * context is charged to every item, because that is what each subagent actually receives.
 *
 * Items whose agent is not a `kb-*` board agent are dropped here, which is what makes
 * this hook inert outside a kanban cycle.
 */
export function parseDispatch(toolCallId: string, input: unknown): Dispatch {
  const items: DispatchItem[] = [];
  const root = (input ?? {}) as Record<string, unknown>;
  const shared = typeof root.context === "string" ? root.context.length : 0;

  const raw: Record<string, unknown>[] = Array.isArray(root.tasks)
    ? (root.tasks as Record<string, unknown>[])
    : [root];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const agent = typeof entry.agent === "string" ? entry.agent : "";
    if (!agent.startsWith("kb-")) continue;
    const prompt = typeof entry.prompt === "string" ? entry.prompt : "";
    items.push({
      agent,
      taskId: parseTaskId(prompt),
      promptChars: prompt.length + shared,
    });
  }
  return { toolCallId, items };
}

/** Board task ids are T<number>; anything else is not a dedup key we can trust. */
export function parseTaskId(prompt: string): string | null {
  const m = /\bT\d{1,4}\b/.exec(prompt);
  return m ? m[0] : null;
}

// ------------------------------------------------------------------ breakers

/** Entries from a crashed or killed session must not block the board forever. */
export function reap(state: GuardState, cfg: GuardConfig, now: number): GuardState {
  const inflight = state.inflight.filter((e) => now - e.startedAt < cfg.staleMs);
  if (inflight.length === state.inflight.length) return state;
  return { ...state, inflight };
}

/**
 * OPEN while any provider's retry deadline is still in the future; HALF_OPEN once every
 * deadline has passed but at least one breaker is still tripped; CLOSED otherwise.
 *
 * Aggregating across providers is deliberate. The extension gates *dispatch*, not
 * provider choice — core picks the provider via retry.fallbackChains. Refusing to start
 * new workers while any provider is rate limited is what stops a failed batch from
 * migrating onto the fallback all at once.
 */
export function breakerPhase(
  state: GuardState,
  now: number,
): { phase: string; until: number; provider: string | null } {
  let until = 0;
  let provider: string | null = null;
  let tripped = false;
  for (const [id, b] of Object.entries(state.breakers)) {
    if (b.state !== "open") continue;
    tripped = true;
    if (b.retryAfter > until) {
      until = b.retryAfter;
      provider = id;
    }
  }
  if (!tripped) return { phase: "closed", until: 0, provider: null };
  if (until > now) return { phase: "open", until, provider };
  return { phase: "half_open", until, provider };
}

const PROVIDER_PATTERNS: [RegExp, string][] = [
  [/anthropic|claude/i, "anthropic"],
  [/openai|codex|gpt-/i, "openai"],
  [/gemini|google|vertex/i, "google"],
  [/bedrock/i, "bedrock"],
];

export function detectProvider(text: string): string {
  for (const [re, id] of PROVIDER_PATTERNS) if (re.test(text)) return id;
  return "default";
}

/** omp normalizes provider errors before they reach a tool result; match its vocabulary. */
export function isRateLimited(text: string): boolean {
  return (
    /rate[_ -]?limit/i.test(text) ||
    /\b429\b/.test(text) ||
    /usage limit|quota exceeded|overloaded_error|insufficient_quota/i.test(text)
  );
}

/**
 * Honors provider retry metadata where it survives into the error text, in the same
 * forms omp itself reads: retry-after-ms, retry-after (seconds or HTTP date), and
 * x-ratelimit-reset (epoch seconds). Returns null when nothing is stated, leaving the
 * caller to fall back to bounded backoff.
 */
export function parseRetryAfterMs(text: string, now: number): number | null {
  let m = /retry[_-]?after[_-]?ms["'\s:=]+(\d+)/i.exec(text);
  if (m) return Number(m[1]);

  m = /retry[_-]?after["'\s:=]+(\d+(?:\.\d+)?)\b/i.exec(text);
  if (m) return Math.round(Number(m[1]) * 1000);

  m = /x-ratelimit-reset(?:-after)?["'\s:=]+(\d{9,})/i.exec(text);
  if (m) {
    const delta = Number(m[1]) * 1000 - now;
    if (delta > 0) return delta;
  }

  m = /try again in (\d+(?:\.\d+)?)\s*(ms|s|sec|secs|seconds|m|min|mins|minutes|h|hours?)\b/i
    .exec(text);
  if (m) {
    const v = Number(m[1]);
    const unit = m[2].toLowerCase();
    if (unit === "ms") return Math.round(v);
    if (unit.startsWith("s")) return Math.round(v * 1000);
    if (unit.startsWith("m")) return Math.round(v * 60000);
    return Math.round(v * 3600000);
  }
  return null;
}

/**
 * Bounded exponential backoff with jitter, used only when the provider stated no
 * deadline. `rng` is injected so the jitter is deterministic under test.
 */
export function backoffMs(trips: number, cfg: GuardConfig, rng: () => number): number {
  const base = Math.min(cfg.breakerBaseMs * Math.pow(2, Math.max(0, trips)), cfg.breakerMaxMs);
  return Math.round(base * (1 + cfg.jitterRatio * rng()));
}

// ------------------------------------------------------------------ decision

function ev(event: string, now: number, fields: Record<string, unknown>): GuardEvent {
  return { ts: new Date(now).toISOString(), event, ...fields };
}

function deny(
  state: GuardState,
  code: string,
  reason: string,
  now: number,
  fields: Record<string, unknown>,
): Decision {
  return {
    allow: false,
    code,
    reason,
    state,
    events: [ev("dispatch_blocked", now, { code, reason, ...fields })],
  };
}

/**
 * The gate. Pure: same inputs, same decision — the hook shell supplies clock and state.
 *
 * Order is deliberate. Permanent problems (a duplicate id, an oversized packet) are
 * reported before transient ones (concurrency), because the orchestrator's correct
 * response differs: fix the dispatch versus wait and retry.
 */
export function decideDispatch(
  prior: GuardState,
  dispatch: Dispatch,
  cfg: GuardConfig,
  now: number,
): Decision {
  const state = reap(prior, cfg, now);
  if (dispatch.items.length === 0) {
    return { allow: true, code: null, reason: null, state, events: [] };
  }

  const { phase, until, provider } = breakerPhase(state, now);
  if (phase === "open") {
    const secs = Math.ceil((until - now) / 1000);
    return deny(
      state,
      "breaker_open",
      `provider ${provider} is rate limited; dispatch is paused until ` +
        `${new Date(until).toISOString()} (${secs}s). This is an infrastructure pause, ` +
        `not a task failure — preserve worktrees and resume, do not re-plan.`,
      now,
      { provider, until, agents: dispatch.items.map((i) => i.agent) },
    );
  }

  const seen = new Set(state.inflight.map((e) => e.taskId).filter(Boolean));
  for (const item of dispatch.items) {
    if (item.taskId && seen.has(item.taskId)) {
      const held = state.inflight.find((e) => e.taskId === item.taskId)!;
      return deny(
        state,
        "duplicate_dispatch",
        `${item.taskId} is already in flight (dispatched ` +
          `${new Date(held.startedAt).toISOString()}). Concurrent retries must not launch ` +
          `the same task twice; wait for the running one to report.`,
        now,
        { taskId: item.taskId },
      );
    }
    if (item.taskId) seen.add(item.taskId);
  }

  for (const item of dispatch.items) {
    if (item.promptChars > cfg.maxPacketChars) {
      return deny(
        state,
        "packet_oversize",
        `assignment for ${item.agent} is ${item.promptChars} chars, over the ` +
          `${cfg.maxPacketChars} limit. Send a task packet ` +
          `(python3 "$RUN_DIR/kb_db.py" packet --task-id <id>) and file references, not ` +
          `documents — a worker needs its own acceptance criteria, not the whole board.`,
        now,
        { agent: item.agent, promptChars: item.promptChars, taskId: item.taskId },
      );
    }
  }

  const events: GuardEvent[] = [];
  for (const item of dispatch.items) {
    if (item.promptChars > cfg.warnPacketChars) {
      events.push(
        ev("packet_large", now, {
          agent: item.agent,
          taskId: item.taskId,
          promptChars: item.promptChars,
          warnAt: cfg.warnPacketChars,
        }),
      );
    }
  }

  if (phase === "half_open") {
    const canaryOut = state.inflight.some((e) => e.canary);
    if (canaryOut) {
      return deny(
        state,
        "canary_in_flight",
        `provider recovery is in progress and one canary dispatch is already running. ` +
          `Exactly ${cfg.maxRecoveryConcurrency} runs during recovery.`,
        now,
        { provider },
      );
    }
    if (dispatch.items.length > cfg.maxRecoveryConcurrency) {
      return deny(
        state,
        "recovery_concurrency",
        `provider ${provider} is recovering: ${dispatch.items.length} dispatches requested, ` +
          `${cfg.maxRecoveryConcurrency} allowed. Send one canary; normal concurrency ` +
          `returns after it succeeds.`,
        now,
        { provider, requested: dispatch.items.length },
      );
    }
  }

  const counts = (list: { agent: string }[], set: Set<string>) =>
    list.filter((e) => set.has(e.agent)).length;

  const checks: [Set<string> | null, number, string, string][] = [
    [IMPLEMENTATION_AGENTS, cfg.maxImplementationConcurrency, "concurrency_implementation",
      "implementation workers"],
    [HIGH_EFFORT_AGENTS, cfg.maxHighEffortConcurrency, "concurrency_high_effort",
      "high-effort agents"],
    [null, cfg.maxTotalConcurrency, "concurrency_total", "board agents"],
  ];

  for (const [set, cap, code, label] of checks) {
    const running = set ? counts(state.inflight, set) : state.inflight.length;
    const adding = set ? counts(dispatch.items, set) : dispatch.items.length;
    if (adding === 0) continue;
    if (running + adding > cap) {
      return deny(
        state,
        code,
        `${adding} ${label} requested with ${running} already running exceeds the cap of ` +
          `${cap}. Dispatch in batches of at most ${Math.max(0, cap - running)} and let ` +
          `each batch finish — six concurrent sessions is what exhausted the provider.`,
        now,
        { requested: adding, running, cap },
      );
    }
  }

  const canary = phase === "half_open";
  const inflight = state.inflight.concat(
    dispatch.items.map((i) => ({
      toolCallId: dispatch.toolCallId,
      agent: i.agent,
      taskId: i.taskId,
      startedAt: now,
      canary,
    })),
  );

  events.push(
    ev("dispatch_allowed", now, {
      width: dispatch.items.length,
      agents: dispatch.items.map((i) => i.agent),
      taskIds: dispatch.items.map((i) => i.taskId),
      packetChars: dispatch.items.map((i) => i.promptChars),
      inflightAfter: inflight.length,
      canary,
    }),
  );

  return { allow: true, code: null, reason: null, state: { ...state, inflight }, events };
}

/**
 * Settles a dispatch. Releases its in-flight slots, trips the breaker on a normalized
 * rate-limit error, and closes it when a canary comes back clean.
 */
export function applyResult(
  prior: GuardState,
  result: { toolCallId: string; isError: boolean; text: string },
  cfg: GuardConfig,
  now: number,
  rng: () => number,
): { state: GuardState; events: GuardEvent[] } {
  const state = reap(prior, cfg, now);
  const released = state.inflight.filter((e) => e.toolCallId === result.toolCallId);
  if (released.length === 0 && !isRateLimited(result.text)) {
    return { state, events: [] };
  }

  const inflight = state.inflight.filter((e) => e.toolCallId !== result.toolCallId);
  const breakers: Record<string, Breaker> = { ...state.breakers };
  const events: GuardEvent[] = [];
  const wasCanary = released.some((e) => e.canary);

  if (isRateLimited(result.text)) {
    const provider = detectProvider(result.text);
    const prev = breakers[provider];
    const trips = (prev?.trips ?? 0) + 1;
    const stated = parseRetryAfterMs(result.text, now);
    const waitMs = stated ?? backoffMs(trips - 1, cfg, rng);
    breakers[provider] = {
      state: "open",
      openedAt: now,
      retryAfter: now + waitMs,
      trips,
    };
    events.push(
      ev("breaker_open", now, {
        provider,
        from: prev?.state ?? "closed",
        trips,
        waitMs,
        retryAfterSource: stated === null ? "backoff" : "provider",
        until: now + waitMs,
        released: released.length,
      }),
    );
  } else if (wasCanary && !result.isError) {
    for (const [id, b] of Object.entries(breakers)) {
      if (b.state !== "open") continue;
      breakers[id] = { ...b, state: "closed", retryAfter: 0, trips: 0 };
      events.push(ev("breaker_closed", now, { provider: id, via: "canary" }));
    }
  }

  if (released.length > 0) {
    events.push(
      ev("dispatch_settled", now, {
        released: released.length,
        agents: released.map((e) => e.agent),
        taskIds: released.map((e) => e.taskId),
        isError: result.isError,
        canary: wasCanary,
        inflightAfter: inflight.length,
      }),
    );
  }

  return { state: { version: state.version, inflight, breakers }, events };
}

// -------------------------------------------------------------------- persistence

const STATE_DIR = path.join(os.homedir(), ".omp", "agent", "kanban-guardrails");
const STATE_FILE = path.join(STATE_DIR, "guardrails.json");
const CONFIG_FILE = path.join(STATE_DIR, "config.json");
const EVENT_LOG = path.join(STATE_DIR, "events.jsonl");
const LOCK_DIR = path.join(STATE_DIR, ".lock");
const LOCK_STALE_MS = 10_000;

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Atomic across processes: mkdir either creates the directory or fails. */
async function withLock<T>(fn: () => T): Promise<T> {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      fs.mkdirSync(LOCK_DIR);
      try {
        return fn();
      } finally {
        try {
          fs.rmdirSync(LOCK_DIR);
        } catch {
          /* already gone */
        }
      }
    } catch {
      try {
        const age = Date.now() - fs.statSync(LOCK_DIR).mtimeMs;
        if (age > LOCK_STALE_MS) fs.rmdirSync(LOCK_DIR);
      } catch {
        /* raced with the holder */
      }
      await new Promise((r) => setTimeout(r, 15));
    }
  }
  // Lock never came free. Proceed unlocked rather than blocking the session: a lost
  // counter update is recoverable, a hung dispatch gate is not.
  return fn();
}

function loadState(): GuardState {
  return readJson<GuardState>(STATE_FILE) ?? emptyState();
}

function saveState(state: GuardState): void {
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, STATE_FILE);
}

/**
 * Structured telemetry. Records what a post-incident audit needs — widths, packet sizes,
 * breaker transitions, retry deadlines, settle outcomes — and never prompt text,
 * assignments, tool output, or credentials.
 */
function appendEvents(events: GuardEvent[], cfg: GuardConfig): void {
  if (events.length === 0) return;
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    try {
      if (fs.statSync(EVENT_LOG).size > cfg.eventLogMaxBytes) {
        fs.renameSync(EVENT_LOG, EVENT_LOG + ".1");
      }
    } catch {
      /* no log yet */
    }
    fs.appendFileSync(EVENT_LOG, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  } catch {
    /* telemetry is never worth failing a dispatch over */
  }
}

// -------------------------------------------------------------------------- hook

export default function hook(pi: HookAPI): void {
  if (process.env.KB_GUARD_DISABLED === "1") return;

  const cfg = resolveConfig(readJson<Partial<GuardConfig>>(CONFIG_FILE), process.env);

  pi.on("tool_call", async (event) => {
    try {
      const e = event as unknown as { toolName?: string; toolCallId?: string; input?: unknown };
      if (e.toolName !== "task") return;

      const dispatch = parseDispatch(e.toolCallId ?? "", e.input);
      if (dispatch.items.length === 0) return; // not a board dispatch — stay inert

      const decision = await withLock(() => {
        const d = decideDispatch(loadState(), dispatch, cfg, Date.now());
        if (d.allow) saveState(d.state);
        return d;
      });

      appendEvents(decision.events, cfg);
      if (!decision.allow) {
        pi.sendMessage(`⛔ kanban guardrail (${decision.code}): ${decision.reason}`);
        return { block: true, reason: `kanban guardrail [${decision.code}]: ${decision.reason}` };
      }
    } catch {
      // Fail open. A guardrail that breaks the session is worse than one that misses.
    }
    return;
  });

  pi.on("tool_result", async (event) => {
    try {
      const e = event as unknown as {
        toolName?: string;
        toolCallId?: string;
        isError?: boolean;
        content?: unknown;
      };
      if (e.toolName !== "task") return;

      const text = textOf(e.content).slice(0, 20000);
      const events = await withLock(() => {
        const r = applyResult(
          loadState(),
          { toolCallId: e.toolCallId ?? "", isError: !!e.isError, text },
          cfg,
          Date.now(),
          Math.random,
        );
        saveState(r.state);
        return r.events;
      });

      appendEvents(events, cfg);
      const opened = events.find((x) => x.event === "breaker_open");
      if (opened) {
        pi.sendMessage(
          `⏸ kanban guardrail: ${opened.provider} rate limited — dispatch paused until ` +
            `${new Date(opened.until as number).toISOString()}. Worktrees and partial work ` +
            `are preserved; resume from the board rather than re-planning.`,
        );
      }
    } catch {
      /* fail open */
    }
    return;
  });
}
