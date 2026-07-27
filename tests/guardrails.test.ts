// Tests for the dispatch guardrails hook.
//
// Everything here exercises the exported pure functions, which take state, a
// clock, and an RNG as arguments. No timers, no sleeping, no filesystem: a
// retry-window test that waits for a real provider window is a test nobody runs.
//
//   node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULTS,
  applyResult,
  backoffMs,
  breakerPhase,
  decideDispatch,
  detectProvider,
  emptyState,
  isRateLimited,
  parseDispatch,
  parseRetryAfterMs,
  parseTaskId,
  reap,
  resolveConfig,
  type GuardState,
} from "../hooks/pre/kb-guardrails.ts";

const T0 = 1_700_000_000_000;
const frozenRng = () => 0.5;

let nextTaskId = 1;

/** Distinct task ids by default, so width checks are not masked by the dedup check. */
function dispatch(agent: string, count: number, chars = 500, id = "call-1") {
  return {
    toolCallId: id,
    items: Array.from({ length: count }, () => ({
      agent,
      taskId: `T${nextTaskId++}`,
      promptChars: chars,
    })),
  };
}

/** Settle a dispatch cleanly, as omp does when the batch returns. */
function settle(state: GuardState, toolCallId: string, at: number): GuardState {
  return applyResult(state, { toolCallId, isError: false, text: "ok" },
    DEFAULTS, at, frozenRng).state;
}

// ------------------------------------------------------------ 1. concurrency

test("six high-effort workers never run six at once", () => {
  const six = decideDispatch(emptyState(), dispatch("kb-dev", 6), DEFAULTS, T0);
  assert.equal(six.allow, false);
  assert.equal(six.code, "concurrency_implementation");
  assert.equal(six.state.inflight.length, 0, "a blocked batch reserves nothing");

  // The board's only way through is batches of two, in sequence.
  let state = emptyState();
  let admitted = 0;
  for (let batch = 0; batch < 3; batch++) {
    const d = decideDispatch(state, dispatch("kb-dev", 2, 500, `call-${batch}`),
      DEFAULTS, T0 + batch);
    assert.equal(d.allow, true, `batch ${batch} should be admitted`);
    assert.ok(d.state.inflight.length <= DEFAULTS.maxImplementationConcurrency);
    admitted += 2;
    state = settle(d.state, `call-${batch}`, T0 + batch + 1);
  }
  assert.equal(admitted, 6, "all six run — two at a time, never six at once");
});

test("a second batch is refused while the first is still in flight", () => {
  const first = decideDispatch(emptyState(), dispatch("kb-dev", 2, 500, "a"),
    DEFAULTS, T0);
  assert.equal(first.allow, true);
  const second = decideDispatch(first.state, dispatch("kb-dev", 1, 500, "b"),
    DEFAULTS, T0 + 10);
  assert.equal(second.allow, false);
  assert.equal(second.code, "concurrency_implementation");
  assert.match(second.reason!, /1 implementation workers requested with 2 already running/);
});

test("high-effort agents are capped independently of implementation workers", () => {
  const d = decideDispatch(emptyState(), {
    toolCallId: "c",
    items: ["kb-planner", "kb-decompose", "kb-review"].map((agent, i) => ({
      agent, taskId: `T${i}`, promptChars: 100,
    })),
  }, DEFAULTS, T0);
  assert.equal(d.allow, false);
  assert.equal(d.code, "concurrency_high_effort");
});

test("the review pair runs together as a bounded pair of exactly two", () => {
  const pair = decideDispatch(emptyState(), {
    toolCallId: "review",
    items: [
      { agent: "kb-review", taskId: null, promptChars: 800 },
      { agent: "kb-critic", taskId: null, promptChars: 800 },
    ],
  }, DEFAULTS, T0);
  assert.equal(pair.allow, true, "two reviewers are the intended concurrency");
  assert.equal(pair.state.inflight.length, 2);

  // A third reviewer alongside them is not.
  const third = decideDispatch(pair.state, {
    toolCallId: "extra",
    items: [{ agent: "kb-critic", taskId: null, promptChars: 800 }],
  }, DEFAULTS, T0 + 1);
  assert.equal(third.allow, false);
  assert.equal(third.code, "concurrency_high_effort");
});

test("agents outside the named roles still hit the total ceiling", () => {
  const d = decideDispatch(emptyState(), dispatch("kb-qa", 5), DEFAULTS, T0);
  assert.equal(d.allow, false);
  assert.equal(d.code, "concurrency_total");
});

// -------------------------------------------------------------- 2. inertness

test("non-task tool calls and non-kb agents are invisible to the gate", () => {
  assert.equal(parseDispatch("c", { prompt: "do a thing" }).items.length, 0);
  assert.equal(
    parseDispatch("c", { tasks: [{ agent: "explore", prompt: "x" }] }).items.length, 0);

  const mixed = parseDispatch("c", {
    tasks: [{ agent: "explore", prompt: "x" }, { agent: "kb-dev", prompt: "T4 do it" }],
  });
  assert.equal(mixed.items.length, 1);
  assert.equal(mixed.items[0].agent, "kb-dev");

  // Nothing kb-shaped in the call means the gate returns "allow" untouched.
  const d = decideDispatch(emptyState(), { toolCallId: "c", items: [] }, DEFAULTS, T0);
  assert.equal(d.allow, true);
  assert.equal(d.events.length, 0);
});

test("batch context is charged to every item, because every item receives it", () => {
  const d = parseDispatch("c", {
    context: "x".repeat(1000),
    tasks: [{ agent: "kb-dev", prompt: "y".repeat(50) }],
  });
  assert.equal(d.items[0].promptChars, 1050);
});

test("task ids are parsed for dedup, and absent ids do not fabricate one", () => {
  assert.equal(parseTaskId("Implement T12 in the auth module"), "T12");
  assert.equal(parseTaskId("no identifier here"), null);
});

// ------------------------------------------------------------- 3. task packet

test("an oversized assignment is rejected before it becomes a session", () => {
  const d = decideDispatch(emptyState(),
    dispatch("kb-dev", 1, DEFAULTS.maxPacketChars + 1), DEFAULTS, T0);
  assert.equal(d.allow, false);
  assert.equal(d.code, "packet_oversize");
  assert.match(d.reason!, /packet --task-id/, "the reason names the fix");
});

test("a large-but-legal packet is admitted and recorded, not silently accepted", () => {
  const d = decideDispatch(emptyState(),
    dispatch("kb-dev", 1, DEFAULTS.warnPacketChars + 1), DEFAULTS, T0);
  assert.equal(d.allow, true);
  const warn = d.events.find((e) => e.event === "packet_large");
  assert.ok(warn, "crossing the warn threshold is visible in telemetry");
  assert.equal(warn!.promptChars, DEFAULTS.warnPacketChars + 1);
});

// ------------------------------------------------------- 4. retry dedup

test("concurrent retries cannot launch the same task twice", () => {
  const first = decideDispatch(emptyState(), {
    toolCallId: "a", items: [{ agent: "kb-dev", taskId: "T7", promptChars: 100 }],
  }, DEFAULTS, T0);
  assert.equal(first.allow, true);

  const retry = decideDispatch(first.state, {
    toolCallId: "b", items: [{ agent: "kb-dev", taskId: "T7", promptChars: 100 }],
  }, DEFAULTS, T0 + 5);
  assert.equal(retry.allow, false);
  assert.equal(retry.code, "duplicate_dispatch");

  // Once it reports, the same id may legitimately be re-dispatched for rework.
  const after = decideDispatch(settle(first.state, "a", T0 + 10), {
    toolCallId: "c", items: [{ agent: "kb-dev", taskId: "T7", promptChars: 100 }],
  }, DEFAULTS, T0 + 11);
  assert.equal(after.allow, true);
});

// --------------------------------------------------------- 5. circuit breaker

const RATE_LIMITED = {
  toolCallId: "a",
  isError: true,
  text: 'anthropic error: {"type":"rate_limit_error","status":429} retry-after: 120',
};

test("normalized rate-limit shapes are recognized, ordinary failures are not", () => {
  assert.equal(isRateLimited(RATE_LIMITED.text), true);
  assert.equal(isRateLimited("429"), true);
  assert.equal(isRateLimited("usage limit reached for this account"), true);
  assert.equal(isRateLimited("AssertionError: expected 3 to equal 4"), false,
    "a failing test is a task failure, not an infrastructure one");
  assert.equal(detectProvider(RATE_LIMITED.text), "anthropic");
});

test("the first 429 opens the breaker and honors the stated retry window", () => {
  const started = decideDispatch(emptyState(), dispatch("kb-dev", 1, 100, "a"),
    DEFAULTS, T0);
  const { state, events } = applyResult(started.state, RATE_LIMITED, DEFAULTS,
    T0, frozenRng);

  const opened = events.find((e) => e.event === "breaker_open");
  assert.ok(opened);
  assert.equal(opened!.provider, "anthropic");
  assert.equal(opened!.retryAfterSource, "provider");
  assert.equal(state.breakers.anthropic.retryAfter, T0 + 120_000,
    "retry-after: 120 means 120 seconds, taken literally");
  assert.equal(breakerPhase(state, T0).phase, "open");
});

test("no new dispatch starts while the breaker is open", () => {
  const { state } = applyResult(emptyState(), RATE_LIMITED, DEFAULTS, T0, frozenRng);
  const blocked = decideDispatch(state, dispatch("kb-dev", 1, 100, "b"),
    DEFAULTS, T0 + 60_000);
  assert.equal(blocked.allow, false);
  assert.equal(blocked.code, "breaker_open");
  assert.match(blocked.reason!, /infrastructure pause, not a task failure/);
});

test("exactly one canary is admitted when the window expires", () => {
  const { state } = applyResult(emptyState(), RATE_LIMITED, DEFAULTS, T0, frozenRng);
  const after = T0 + 120_001;
  assert.equal(breakerPhase(state, after).phase, "half_open");

  // A normal-width batch is still refused during recovery.
  const wide = decideDispatch(state, dispatch("kb-dev", 2, 100, "b"), DEFAULTS, after);
  assert.equal(wide.allow, false);
  assert.equal(wide.code, "recovery_concurrency");

  const canary = decideDispatch(state, dispatch("kb-dev", 1, 100, "c"), DEFAULTS, after);
  assert.equal(canary.allow, true);
  assert.equal(canary.state.inflight.length, 1);
  assert.equal(canary.state.inflight[0].canary, true);

  // And no second one alongside it.
  const second = decideDispatch(canary.state, {
    toolCallId: "d", items: [{ agent: "kb-dev", taskId: "T99", promptChars: 100 }],
  }, DEFAULTS, after + 1);
  assert.equal(second.allow, false);
  assert.equal(second.code, "canary_in_flight");
});

test("a successful canary restores normal concurrency; a failed one re-opens", () => {
  const tripped = applyResult(emptyState(), RATE_LIMITED, DEFAULTS, T0, frozenRng).state;
  const after = T0 + 120_001;
  const canary = decideDispatch(tripped, dispatch("kb-dev", 1, 100, "c"), DEFAULTS, after);

  const recovered = applyResult(canary.state,
    { toolCallId: "c", isError: false, text: "done" }, DEFAULTS, after + 10, frozenRng);
  assert.equal(breakerPhase(recovered.state, after + 10).phase, "closed");
  assert.ok(recovered.events.some((e) => e.event === "breaker_closed"));
  const normal = decideDispatch(recovered.state, dispatch("kb-dev", 2, 100, "e"),
    DEFAULTS, after + 20);
  assert.equal(normal.allow, true, "full width returns only after the canary proves it");

  const failedAgain = applyResult(canary.state,
    { toolCallId: "c", isError: true, text: RATE_LIMITED.text },
    DEFAULTS, after + 10, frozenRng);
  assert.equal(breakerPhase(failedAgain.state, after + 10).phase, "open");
  assert.equal(failedAgain.state.breakers.anthropic.trips, 2,
    "consecutive trips drive the backoff");
});

test("with no provider metadata, backoff is bounded and jitter is deterministic", () => {
  const noMeta = { toolCallId: "a", isError: true, text: "429 Too Many Requests" };
  const { state, events } = applyResult(emptyState(), noMeta, DEFAULTS, T0, frozenRng);
  assert.equal(events[0].retryAfterSource, "backoff");
  assert.equal(state.breakers.default.retryAfter,
    T0 + backoffMs(0, DEFAULTS, frozenRng));

  // Bounded: even a long streak cannot push the window past the ceiling.
  const ceiling = Math.round(DEFAULTS.breakerMaxMs * (1 + DEFAULTS.jitterRatio * 0.5));
  assert.equal(backoffMs(50, DEFAULTS, frozenRng), ceiling);
  assert.ok(ceiling <= DEFAULTS.breakerMaxMs * (1 + DEFAULTS.jitterRatio));
  assert.ok(backoffMs(0, DEFAULTS, frozenRng) < backoffMs(3, DEFAULTS, frozenRng));
});

test("retry metadata is read in each form omp itself parses", () => {
  assert.equal(parseRetryAfterMs("retry-after-ms: 4500", T0), 4500);
  assert.equal(parseRetryAfterMs("retry-after: 30", T0), 30_000);
  assert.equal(parseRetryAfterMs("try again in 2 minutes", T0), 120_000);
  assert.equal(
    parseRetryAfterMs(`x-ratelimit-reset: ${Math.floor(T0 / 1000) + 90}`, T0), 90_000);
  assert.equal(parseRetryAfterMs("something went wrong", T0), null);
});

// --------------------------------------------------------- 6. failover shape

test("a failed batch is not handed to the fallback provider all at once", () => {
  // Six workers are requested; two run; the provider rate limits both.
  const batch = decideDispatch(emptyState(), dispatch("kb-dev", 2, 100, "a"),
    DEFAULTS, T0);
  assert.equal(batch.allow, true);
  const { state } = applyResult(batch.state, RATE_LIMITED, DEFAULTS, T0, frozenRng);

  // Whatever provider core would fail over to, dispatch is closed until the
  // window passes, and then opens one slot — never the original width.
  assert.equal(decideDispatch(state, dispatch("kb-dev", 6, 100, "b"),
    DEFAULTS, T0 + 1).code, "breaker_open");
  const recovering = decideDispatch(state, dispatch("kb-dev", 6, 100, "c"),
    DEFAULTS, T0 + 120_001);
  assert.equal(recovering.allow, false);
  assert.equal(recovering.code, "recovery_concurrency");
  assert.match(recovering.reason!, /Send one canary/);
});

test("each provider carries its own independent window", () => {
  let state = applyResult(emptyState(),
    { toolCallId: "a", isError: true, text: "anthropic rate_limit_error retry-after: 60" },
    DEFAULTS, T0, frozenRng).state;
  state = applyResult(state,
    { toolCallId: "b", isError: true, text: "openai rate_limit_error retry-after: 300" },
    DEFAULTS, T0, frozenRng).state;

  assert.equal(state.breakers.anthropic.retryAfter, T0 + 60_000);
  assert.equal(state.breakers.openai.retryAfter, T0 + 300_000);
  // Dispatch waits for the last one to clear, not the first.
  assert.equal(breakerPhase(state, T0 + 61_000).phase, "open");
  assert.equal(breakerPhase(state, T0 + 301_000).phase, "half_open");
});

// ------------------------------------------------- 7. preservation and reaping

test("a settled dispatch releases only its own slots", () => {
  const a = decideDispatch(emptyState(), {
    toolCallId: "a", items: [{ agent: "kb-dev", taskId: "T1", promptChars: 10 }],
  }, DEFAULTS, T0);
  const b = decideDispatch(a.state, {
    toolCallId: "b", items: [{ agent: "kb-dev", taskId: "T2", promptChars: 10 }],
  }, DEFAULTS, T0 + 1);
  assert.equal(b.state.inflight.length, 2);

  const after = settle(b.state, "a", T0 + 2);
  assert.equal(after.inflight.length, 1);
  assert.equal(after.inflight[0].taskId, "T2", "the other worker is untouched");
});

test("entries from a crashed session are reaped, not left wedging the board", () => {
  const started = decideDispatch(emptyState(), dispatch("kb-dev", 2, 100, "a"),
    DEFAULTS, T0);
  // Nothing ever reports: the session died.
  const late = T0 + DEFAULTS.staleMs + 1;
  assert.equal(reap(started.state, DEFAULTS, late).inflight.length, 0);
  assert.equal(decideDispatch(started.state, dispatch("kb-dev", 2, 100, "b"),
    DEFAULTS, late).allow, true);
  // But not one second early.
  assert.equal(reap(started.state, DEFAULTS, T0 + DEFAULTS.staleMs - 1)
    .inflight.length, 2);
});

// ------------------------------------------------------------- 8. telemetry

test("events carry counts and transitions, never assignment text", () => {
  const d = decideDispatch(emptyState(), dispatch("kb-dev", 2, 9999, "a"), DEFAULTS, T0);
  const allowed = d.events.find((e) => e.event === "dispatch_allowed")!;
  assert.equal(allowed.width, 2);
  assert.deepEqual(allowed.agents, ["kb-dev", "kb-dev"]);
  assert.deepEqual(allowed.packetChars, [9999, 9999]);

  const serialized = JSON.stringify(d.events);
  assert.ok(!serialized.includes("prompt"), "no prompt field leaks into telemetry");
  assert.ok(serialized.length < 1000, "events stay small enough to keep");
});

// --------------------------------------------------- 9. configuration surface

test("defaults are conservative and overridable in both directions", () => {
  assert.equal(DEFAULTS.maxImplementationConcurrency, 2);
  assert.equal(DEFAULTS.maxHighEffortConcurrency, 2);
  assert.equal(DEFAULTS.maxRecoveryConcurrency, 1);

  const fromFile = resolveConfig({ maxImplementationConcurrency: 3 }, {});
  assert.equal(fromFile.maxImplementationConcurrency, 3);
  assert.equal(fromFile.maxHighEffortConcurrency, 2, "untouched keys keep defaults");

  const fromEnv = resolveConfig({ maxImplementationConcurrency: 3 },
    { KB_GUARD_MAX_IMPLEMENTATION_CONCURRENCY: "1" });
  assert.equal(fromEnv.maxImplementationConcurrency, 1, "env wins over file");

  const garbage = resolveConfig({ maxPacketChars: -5 } as never,
    { KB_GUARD_MAX_TOTAL_CONCURRENCY: "not-a-number" });
  assert.equal(garbage.maxPacketChars, DEFAULTS.maxPacketChars);
  assert.equal(garbage.maxTotalConcurrency, DEFAULTS.maxTotalConcurrency);
});
