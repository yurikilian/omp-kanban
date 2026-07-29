// @vitest-environment node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSessionTimeline, getSessionTimeline, parseAgentTimeline } from "./timeline";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.resolve(dirname, "../../../tests/fixtures/sessions/repository-root");

describe("parseAgentTimeline", () => {
  it("turns a user message into a prompt event (E3-S7-AC1)", () => {
    const raw = ['{"type":"message","id":"m1","parentId":null,"timestamp":"2026-03-01T00:01:00.000Z","message":{"role":"user","content":[{"type":"text","text":"Please refactor the billing module."}]}}'].join("\n");

    const events = parseAgentTimeline(raw, "main");

    expect(events).toEqual([
      { type: "prompt", id: "main:m1", timestamp: "2026-03-01T00:01:00.000Z", text: "Please refactor the billing module." },
    ]);
  });

  it("turns an assistant message into a response event, timing it from its parent (E3-S7-AC4)", () => {
    const raw = [
      '{"type":"message","id":"m1","parentId":null,"timestamp":"2026-03-01T00:01:00.000Z","message":{"role":"user","content":[{"type":"text","text":"Go."}]}}',
      '{"type":"message","id":"m2","parentId":"m1","timestamp":"2026-03-01T00:02:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Sure."}],"model":"claude-sonnet-5","usage":{"input":1000,"output":200,"cost":{"total":0.01}}}}',
    ].join("\n");

    const events = parseAgentTimeline(raw, "main");

    expect(events[1]).toEqual({
      type: "response",
      id: "main:m2",
      timestamp: "2026-03-01T00:02:00.000Z",
      agent: "main",
      text: "Sure.",
      model: "claude-sonnet-5",
      durationMs: 60_000,
      inputTokens: 1000,
      outputTokens: 200,
      costUsd: 0.01,
    });
  });

  it("omits usage and model fields the transcript never recorded, rather than defaulting to zero (E3-S7-AC4)", () => {
    const raw = '{"type":"message","id":"m1","parentId":null,"timestamp":"2026-03-01T00:01:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"No usage."}]}}';

    const [event] = parseAgentTimeline(raw, "main");

    expect(event).toMatchObject({
      model: null,
      durationMs: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
    });
  });

  it("collapses a tool call's start and result into one completed event with a computed duration (E3-S7-AC1)", () => {
    const raw = [
      '{"type":"custom","customType":"tool_execution_start","data":{"toolCallId":"t1","toolName":"bash","startedAt":"2026-03-01T00:05:00.000Z","intent":"Run tests"},"id":"c1","parentId":"m1","timestamp":"2026-03-01T00:05:00.000Z"}',
      '{"type":"message","id":"m2","parentId":"c1","timestamp":"2026-03-01T00:05:05.000Z","message":{"role":"toolResult","content":[{"type":"text","text":"ok"}],"toolCallId":"t1","toolName":"bash"}}',
    ].join("\n");

    const events = parseAgentTimeline(raw, "main");

    expect(events).toEqual([
      {
        type: "tool_call",
        id: "main:tool:t1",
        timestamp: "2026-03-01T00:05:00.000Z",
        agent: "main",
        toolName: "bash",
        summary: "Run tests",
        input: "Run tests",
        output: "ok",
        durationMs: 5000,
        outcome: "success",
      },
    ]);
  });
  it("retains a tool call's input intent and result output (E3-S11-AC2)", () => {
    const raw = [
      '{"type":"custom","customType":"tool_execution_start","data":{"toolCallId":"t1","toolName":"bash","startedAt":"2026-03-01T00:05:00.000Z","intent":"npm test -- event-stream"},"id":"c1","parentId":"m1","timestamp":"2026-03-01T00:05:00.000Z"}',
      '{"type":"message","id":"m2","parentId":"c1","timestamp":"2026-03-01T00:05:05.000Z","message":{"role":"toolResult","content":[{"type":"text","text":"Tests passed."}],"toolCallId":"t1","toolName":"bash"}}',
    ].join("\n");

    expect(parseAgentTimeline(raw, "main")).toMatchObject([
      {
        type: "tool_call",
        input: "npm test -- event-stream",
        output: "Tests passed.",
      },
    ]);
  });

  it("turns an assistant message that failed at the model-call level into an error event, not a blank response", () => {
    const raw =
      '{"type":"message","id":"m2","parentId":"m1","timestamp":"2026-03-01T00:02:00.000Z","message":{"role":"assistant","content":[],"model":"claude-sonnet-5","stopReason":"error","errorMessage":"404 no route matched"}}';

    const [event] = parseAgentTimeline(raw, "main");

    expect(event).toEqual({
      type: "error",
      id: "main:m2",
      timestamp: "2026-03-01T00:02:00.000Z",
      agent: "main",
      text: "404 no route matched",
    });
  });

  it("marks a tool call with no matching result yet as pending, with no duration", () => {
    const raw = '{"type":"custom","customType":"tool_execution_start","data":{"toolCallId":"t1","toolName":"bash","startedAt":"2026-03-01T00:05:00.000Z","intent":"a long-running command"},"id":"c1","parentId":"m1","timestamp":"2026-03-01T00:05:00.000Z"}';

    const [event] = parseAgentTimeline(raw, "main");

    expect(event).toMatchObject({ type: "tool_call", outcome: "pending", durationMs: null });
  });

  it("marks a tool result flagged as an error as a failed outcome", () => {
    const raw = [
      '{"type":"custom","customType":"tool_execution_start","data":{"toolCallId":"t1","toolName":"bash","startedAt":"2026-03-01T00:05:00.000Z","intent":"Run the build"},"id":"c1","parentId":"m1","timestamp":"2026-03-01T00:05:00.000Z"}',
      '{"type":"message","id":"m2","parentId":"c1","timestamp":"2026-03-01T00:05:05.000Z","message":{"role":"toolResult","content":[{"type":"text","text":"exit 1"}],"toolCallId":"t1","toolName":"bash","isError":true}}',
    ].join("\n");

    const [event] = parseAgentTimeline(raw, "main");

    expect(event).toMatchObject({ type: "tool_call", outcome: "error" });
  });

  it("turns a session start into a status event and a normal exit into a status event", () => {
    const raw = [
      '{"type":"session","version":3,"id":"s1","timestamp":"2026-03-01T00:00:00.000Z","cwd":"/work"}',
      '{"type":"custom","customType":"session_exit","data":{"reason":"dispose","kind":"normal"},"timestamp":"2026-03-01T00:10:00.000Z"}',
    ].join("\n");

    const events = parseAgentTimeline(raw, "main");

    expect(events).toEqual([
      { type: "status", id: "main:session-start", timestamp: "2026-03-01T00:00:00.000Z", label: "Session started" },
      { type: "status", id: "main:session-exit", timestamp: "2026-03-01T00:10:00.000Z", label: "Session completed" },
    ]);
  });

  it("turns a fatal session exit into an error event rather than a status event", () => {
    const raw = '{"type":"custom","customType":"session_exit","data":{"reason":"uncaught_exception","kind":"fatal"},"timestamp":"2026-03-01T00:10:00.000Z"}';

    const [event] = parseAgentTimeline(raw, "main");

    expect(event).toEqual({
      type: "error",
      id: "main:session-exit",
      timestamp: "2026-03-01T00:10:00.000Z",
      agent: "main",
      text: "Session failed: uncaught_exception",
    });
  });

  it("tags every response, tool-call and error event it produces with the given agent name", () => {
    const raw = '{"type":"message","id":"w1","parentId":null,"timestamp":"2026-03-01T00:01:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Working."}]}}';

    const [event] = parseAgentTimeline(raw, "Worker");

    expect(event).toMatchObject({ agent: "Worker" });
  });

  it("skips an unparseable trailing line instead of throwing, keeping what came before it", () => {
    const raw = [
      '{"type":"message","id":"m1","parentId":null,"timestamp":"2026-03-01T00:01:00.000Z","message":{"role":"user","content":[{"type":"text","text":"Go."}]}}',
      '{"type":"message","id":"m2","parentId":"m1","timestamp":"2026-03-01T00:0',
    ].join("\n");

    const events = parseAgentTimeline(raw, "main");

    expect(events).toEqual([
      { type: "prompt", id: "main:m1", timestamp: "2026-03-01T00:01:00.000Z", text: "Go." },
    ]);
  });
});

describe("buildSessionTimeline", () => {
  const mainRaw = [
    '{"type":"message","id":"m1","parentId":null,"timestamp":"2026-03-02T00:01:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Spawning."}]}}',
    '{"type":"custom","customType":"tool_execution_start","data":{"toolCallId":"t1","toolName":"task","startedAt":"2026-03-02T00:02:00.000Z","intent":"Delegate research to Scout"},"id":"c1","parentId":"m1","timestamp":"2026-03-02T00:02:00.000Z"}',
  ].join("\n");
  const scoutRaw = '{"type":"session","version":3,"id":"scout-sub","timestamp":"2026-03-02T00:02:30.000Z","cwd":"/work"}';

  it("merges a sub-agent's events into the main timeline as a parent-to-child delegation, in chronological order (E3-S7-AC1)", () => {
    const events = buildSessionTimeline(mainRaw, [{ name: "Scout", raw: scoutRaw }]);

    expect(events.map((event) => event.timestamp)).toEqual([
      "2026-03-02T00:01:00.000Z",
      "2026-03-02T00:02:00.000Z",
      "2026-03-02T00:02:30.000Z",
      "2026-03-02T00:02:30.000Z",
    ]);
    expect(events[2]).toEqual({
      type: "delegation",
      id: "delegation:Scout",
      timestamp: "2026-03-02T00:02:30.000Z",
      parentAgent: "main",
      childAgent: "Scout",
      task: "Delegate research to Scout",
    });
  });

  it("still emits a delegation event when no spawning tool call can be correlated", () => {
    const events = buildSessionTimeline('{"type":"session","version":3,"id":"m","timestamp":"2026-03-02T00:00:00.000Z","cwd":"/work"}', [
      { name: "Scout", raw: scoutRaw },
    ]);

    const delegation = events.find((event) => event.type === "delegation");
    expect(delegation).toMatchObject({ task: null, childAgent: "Scout" });
  });

  it("returns just the main timeline's events when there are no sub-agents", () => {
    const events = buildSessionTimeline(mainRaw, []);

    expect(events).toEqual(parseAgentTimeline(mainRaw, "main"));
  });
});

describe("getSessionTimeline", () => {
  it("builds the full merged timeline for a session with sub-agents from real transcript files (E3-S7-AC1)", async () => {
    const events = await getSessionTimeline("2026-01-01T10-00-00-000Z_00000000-0000-7000-8000-00000000000b", fixturesRoot);

    expect(events).not.toBeNull();
    const nonNull = events!;

    // Chronological across every merged file.
    const timestamps = nonNull.map((event) => event.timestamp);
    expect(timestamps).toEqual([...timestamps].sort());
    expect(nonNull).toHaveLength(13);

    const delegations = nonNull.filter((event) => event.type === "delegation");
    expect(delegations).toEqual([
      {
        type: "delegation",
        id: "delegation:Worker",
        timestamp: "2026-01-01T10:02:30.000Z",
        parentAgent: "main",
        childAgent: "Worker",
        task: "Spawn Worker and Helper",
      },
      {
        type: "delegation",
        id: "delegation:Helper",
        timestamp: "2026-01-01T10:02:45.000Z",
        parentAgent: "main",
        childAgent: "Helper",
        task: "Spawn Worker and Helper",
      },
    ]);

    const taskCall = nonNull.find((event) => event.type === "tool_call" && event.toolName === "task");
    expect(taskCall).toMatchObject({ outcome: "success", durationMs: 3 * 60 * 1000, agent: "main" });

    const workerResponse = nonNull.find((event) => event.type === "response" && event.agent === "Worker");
    expect(workerResponse).toMatchObject({ text: "Working." });

    const pendingWorkerCall = nonNull.find((event) => event.type === "tool_call" && event.summary === "Verify migration");
    expect(pendingWorkerCall).toMatchObject({ outcome: "pending", durationMs: null, agent: "Worker" });
  });

  it("returns null for a session that does not exist", async () => {
    const events = await getSessionTimeline("does-not-exist", fixturesRoot);
    expect(events).toBeNull();
  });

  it("returns null for an unsafe session id rather than touching the filesystem", async () => {
    const events = await getSessionTimeline("../../etc/passwd", fixturesRoot);
    expect(events).toBeNull();
  });
});