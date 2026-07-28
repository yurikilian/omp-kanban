// @vitest-environment node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildAgentHierarchy, getSessionAgents } from "./agents";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.resolve(dirname, "../../../tests/fixtures/sessions/repository-root");

describe("buildAgentHierarchy", () => {
  it("each agent appears once with a name and hierarchical path, nested under the agent that spawned it (E3-S8-AC1)", () => {
    const mainRaw = [
      '{"type":"session","version":3,"id":"main","timestamp":"2026-05-01T00:00:00.000Z","cwd":"/work"}',
      '{"type":"custom","customType":"tool_execution_start","data":{"toolCallId":"t1","toolName":"task","startedAt":"2026-05-01T00:01:00.000Z","intent":"Spawn Worker"},"id":"c1","timestamp":"2026-05-01T00:01:00.000Z"}',
      '{"type":"message","id":"r1","timestamp":"2026-05-01T00:01:01.000Z","message":{"role":"toolResult","toolCallId":"t1","toolName":"task","content":[{"type":"text","text":"Spawned agent `Worker` (job `Worker`)."}]}}',
    ].join("\n");
    const workerRaw = '{"type":"session","version":3,"id":"worker-sub","timestamp":"2026-05-01T00:02:00.000Z","cwd":"/work"}';

    const nodes = buildAgentHierarchy({ name: "main", raw: mainRaw }, [{ name: "Worker", raw: workerRaw }]);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ name: "main", path: ["main"], parentUnknown: false });
    expect(nodes[0].children).toHaveLength(1);
    expect(nodes[0].children[0]).toMatchObject({
      name: "Worker",
      path: ["main", "Worker"],
      parentUnknown: false,
      children: [],
    });
  });

  it("nests a sub-agent under whichever other transcript actually spawned it, not always under main", () => {
    const mainRaw = [
      '{"type":"session","version":3,"id":"main","timestamp":"2026-05-02T00:00:00.000Z","cwd":"/work"}',
      '{"type":"custom","customType":"tool_execution_start","data":{"toolCallId":"t1","toolName":"task","startedAt":"2026-05-02T00:01:00.000Z","intent":"Spawn Planner"},"id":"c1","timestamp":"2026-05-02T00:01:00.000Z"}',
      '{"type":"message","id":"r1","timestamp":"2026-05-02T00:01:01.000Z","message":{"role":"toolResult","toolCallId":"t1","toolName":"task","content":[{"type":"text","text":"Spawned agent `Planner` (job `Planner`)."}]}}',
    ].join("\n");
    const plannerRaw = [
      '{"type":"session","version":3,"id":"planner-sub","timestamp":"2026-05-02T00:02:00.000Z","cwd":"/work"}',
      '{"type":"custom","customType":"tool_execution_start","data":{"toolCallId":"t2","toolName":"task","startedAt":"2026-05-02T00:03:00.000Z","intent":"Spawn Developer"},"id":"c2","timestamp":"2026-05-02T00:03:00.000Z"}',
      '{"type":"message","id":"r2","timestamp":"2026-05-02T00:03:01.000Z","message":{"role":"toolResult","toolCallId":"t2","toolName":"task","content":[{"type":"text","text":"Spawned agent `Developer` (job `Developer`)."}]}}',
    ].join("\n");
    const developerRaw = '{"type":"session","version":3,"id":"developer-sub","timestamp":"2026-05-02T00:04:00.000Z","cwd":"/work"}';

    const nodes = buildAgentHierarchy({ name: "main", raw: mainRaw }, [
      { name: "Planner", raw: plannerRaw },
      { name: "Developer", raw: developerRaw },
    ]);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].children).toHaveLength(1);
    const planner = nodes[0].children[0];
    expect(planner).toMatchObject({ name: "Planner", path: ["main", "Planner"] });
    expect(planner.children).toHaveLength(1);
    expect(planner.children[0]).toMatchObject({
      name: "Developer",
      path: ["main", "Planner", "Developer"],
      parentUnknown: false,
    });
  });

  it("marks a sub-agent whose spawning parent is not recorded as unknown-parent instead of mistaking an earlier generic task for its parent (E3-S8-AC6)", () => {
    const mainRaw = [
      '{"type":"session","version":3,"id":"main","timestamp":"2026-05-03T00:00:00.000Z","cwd":"/work"}',
      '{"type":"custom","customType":"tool_execution_start","data":{"toolCallId":"t1","toolName":"task","startedAt":"2026-05-03T00:00:30.000Z","intent":"Do unrelated work"},"id":"c1","timestamp":"2026-05-03T00:00:30.000Z"}',
      '{"type":"message","id":"r1","timestamp":"2026-05-03T00:00:31.000Z","message":{"role":"toolResult","toolCallId":"t1","toolName":"task","content":[{"type":"text","text":"Task finished."}]}}',
    ].join("\n");
    const orphanRaw = '{"type":"session","version":3,"id":"orphan-sub","timestamp":"2026-05-03T00:01:00.000Z","cwd":"/work"}';

    const nodes = buildAgentHierarchy({ name: "main", raw: mainRaw }, [{ name: "Orphan", raw: orphanRaw }]);

    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ name: "main", parentUnknown: false });
    expect(nodes[1]).toMatchObject({ name: "Orphan", path: ["Orphan"], parentUnknown: true, children: [] });
  });

  it("returns no nodes at all for a session that spawned no sub-agents (E3-S8-AC4)", () => {
    const nodes = buildAgentHierarchy(
      { name: "main", raw: '{"type":"session","timestamp":"2026-05-04T00:00:00.000Z"}' },
      [],
    );

    expect(nodes).toEqual([]);
  });

  it("derives each agent's own textual status from its own transcript, not the session's overall status", () => {
    const mainRaw = [
      '{"type":"session","version":3,"id":"main","timestamp":"2026-05-05T00:00:00.000Z","cwd":"/work"}',
      '{"type":"custom","customType":"tool_execution_start","data":{"toolCallId":"t1","toolName":"task","startedAt":"2026-05-05T00:01:00.000Z","intent":"Spawn Worker"},"id":"c1","timestamp":"2026-05-05T00:01:00.000Z"}',
      '{"type":"message","id":"r1","timestamp":"2026-05-05T00:01:01.000Z","message":{"role":"toolResult","toolCallId":"t1","toolName":"task","content":[{"type":"text","text":"Spawned agent `Worker` (job `Worker`)."}]}}',
      '{"type":"custom","customType":"session_exit","data":{"reason":"dispose","kind":"normal"},"timestamp":"2026-05-05T00:10:00.000Z"}',
    ].join("\n");
    const workerRaw = [
      '{"type":"session","version":3,"id":"worker-sub","timestamp":"2026-05-05T00:02:00.000Z","cwd":"/work"}',
      '{"type":"custom","customType":"session_exit","data":{"reason":"boom","kind":"fatal"},"timestamp":"2026-05-05T00:05:00.000Z"}',
    ].join("\n");

    const nodes = buildAgentHierarchy({ name: "main", raw: mainRaw }, [{ name: "Worker", raw: workerRaw }]);

    expect(nodes[0].status).toEqual({ label: "Completed", derived: true, basis: "a normal session exit event" });
    expect(nodes[0].children[0].status).toEqual({ label: "Failed", derived: true, basis: "a fatal session exit event" });
  });

  it("shows an agent metric the transcripts never recorded as unavailable rather than zero (E3-S8-AC2)", () => {
    const mainRaw = [
      '{"type":"session","version":3,"id":"main","timestamp":"2026-05-06T00:00:00.000Z","cwd":"/work"}',
      '{"type":"custom","customType":"tool_execution_start","data":{"toolCallId":"t1","toolName":"task","startedAt":"2026-05-06T00:01:00.000Z","intent":"Spawn NoUsageAgent"},"id":"c1","timestamp":"2026-05-06T00:01:00.000Z"}',
      '{"type":"message","id":"r1","timestamp":"2026-05-06T00:01:01.000Z","message":{"role":"toolResult","toolCallId":"t1","toolName":"task","content":[{"type":"text","text":"Spawned agent `NoUsageAgent` (job `NoUsageAgent`)."}]}}',
      '{"type":"custom","customType":"tool_execution_start","data":{"toolCallId":"t2","toolName":"task","startedAt":"2026-05-06T00:01:10.000Z","intent":"Spawn NoStartAgent"},"id":"c2","timestamp":"2026-05-06T00:01:10.000Z"}',
      '{"type":"message","id":"r2","timestamp":"2026-05-06T00:01:11.000Z","message":{"role":"toolResult","toolCallId":"t2","toolName":"task","content":[{"type":"text","text":"Spawned agent `NoStartAgent` (job `NoStartAgent`)."}]}}',
    ].join("\n");
    // Has its own session header (so a duration is computable) but never
    // recorded a usage object on its one assistant turn.
    const noUsageRaw = [
      '{"type":"session","version":3,"id":"no-usage-sub","timestamp":"2026-05-06T00:02:00.000Z","cwd":"/work"}',
      '{"type":"message","id":"n1","timestamp":"2026-05-06T00:02:30.000Z","message":{"role":"assistant","content":[{"type":"text","text":"No usage."}]}}',
    ].join("\n");
    // Never recorded a session header at all, so a start time - and thus a
    // duration - cannot be computed either.
    const noStartRaw =
      '{"type":"message","id":"x1","timestamp":"2026-05-06T00:03:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Hi"}]}}';

    const nodes = buildAgentHierarchy({ name: "main", raw: mainRaw }, [
      { name: "NoUsageAgent", raw: noUsageRaw },
      { name: "NoStartAgent", raw: noStartRaw },
    ]);

    const [noUsageAgent, noStartAgent] = nodes[0].children;
    expect(noUsageAgent).toMatchObject({ name: "NoUsageAgent" });
    expect(noUsageAgent.metrics).toEqual({
      durationMs: 30_000,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
    });

    expect(noStartAgent).toMatchObject({ name: "NoStartAgent" });
    expect(noStartAgent.metrics).toEqual({
      durationMs: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
    });
  });

  it("keeps an individually unrecorded usage field unavailable when another field on that turn is recorded (E3-S8-AC2)", () => {
    const mainRaw = [
      '{"type":"session","version":3,"id":"main","timestamp":"2026-05-06T01:00:00.000Z","cwd":"/work"}',
      '{"type":"message","id":"r1","timestamp":"2026-05-06T01:00:01.000Z","message":{"role":"toolResult","toolCallId":"t1","toolName":"task","content":[{"type":"text","text":"Spawned agent `PartialUsageAgent` (job `PartialUsageAgent`)."}]}}',
    ].join("\n");
    const partialUsageRaw = [
      '{"type":"session","version":3,"id":"partial-usage-sub","timestamp":"2026-05-06T01:01:00.000Z","cwd":"/work"}',
      '{"type":"message","id":"p1","timestamp":"2026-05-06T01:01:30.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Only input usage."}],"usage":{"input":123}}}',
    ].join("\n");

    const [main] = buildAgentHierarchy({ name: "main", raw: mainRaw }, [
      { name: "PartialUsageAgent", raw: partialUsageRaw },
    ]);

    expect(main.children[0].metrics).toEqual({
      durationMs: 30_000,
      inputTokens: 123,
      outputTokens: null,
      costUsd: null,
    });
  });

  it("sorts siblings chronologically by their own first recorded timestamp", () => {
    const mainRaw = [
      '{"type":"session","version":3,"id":"main","timestamp":"2026-05-07T00:00:00.000Z","cwd":"/work"}',
      '{"type":"custom","customType":"tool_execution_start","data":{"toolCallId":"t1","toolName":"task","startedAt":"2026-05-07T00:01:00.000Z","intent":"Spawn Later"},"id":"c1","timestamp":"2026-05-07T00:01:00.000Z"}',
      '{"type":"message","id":"r1","timestamp":"2026-05-07T00:01:01.000Z","message":{"role":"toolResult","toolCallId":"t1","toolName":"task","content":[{"type":"text","text":"Spawned agent `Later` (job `Later`)."}]}}',
      '{"type":"custom","customType":"tool_execution_start","data":{"toolCallId":"t2","toolName":"task","startedAt":"2026-05-07T00:01:02.000Z","intent":"Spawn Earlier"},"id":"c2","timestamp":"2026-05-07T00:01:02.000Z"}',
      '{"type":"message","id":"r2","timestamp":"2026-05-07T00:01:03.000Z","message":{"role":"toolResult","toolCallId":"t2","toolName":"task","content":[{"type":"text","text":"Spawned agent `Earlier` (job `Earlier`)."}]}}',
    ].join("\n");
    const laterRaw = '{"type":"session","version":3,"id":"later-sub","timestamp":"2026-05-07T00:05:00.000Z","cwd":"/work"}';
    const earlierRaw = '{"type":"session","version":3,"id":"earlier-sub","timestamp":"2026-05-07T00:02:00.000Z","cwd":"/work"}';

    // Passed in reverse-chronological order on purpose.
    const nodes = buildAgentHierarchy({ name: "main", raw: mainRaw }, [
      { name: "Later", raw: laterRaw },
      { name: "Earlier", raw: earlierRaw },
    ]);

    expect(nodes[0].children.map((child) => child.name)).toEqual(["Earlier", "Later"]);
  });
});

describe("getSessionAgents", () => {
  it("keeps each sub-agent's own metrics when fixture transcripts do not record which parent spawned it (E3-S8-AC6)", async () => {
    const nodes = await getSessionAgents("2026-01-01T10-00-00-000Z_00000000-0000-7000-8000-00000000000b", fixturesRoot);

    expect(nodes).not.toBeNull();
    const roots = nodes!;
    expect(roots.map((node) => node.name)).toEqual(["main", "Worker", "Helper"]);
    expect(roots[1]).toMatchObject({ name: "Worker", path: ["Worker"], parentUnknown: true });
    expect(roots[2]).toMatchObject({ name: "Helper", path: ["Helper"], parentUnknown: true });

    const worker = roots[1];
    expect(worker.metrics).toEqual({
      durationMs: 4.5 * 60 * 1000,
      inputTokens: 800,
      outputTokens: 150,
      costUsd: 0.008,
    });

    const helper = roots[2];
    expect(helper.metrics).toEqual({
      durationMs: 105_000,
      inputTokens: 300,
      outputTokens: 50,
      costUsd: 0.003,
    });
  });

  it("returns an empty hierarchy for a session that spawned no sub-agents (E3-S8-AC4)", async () => {
    const nodes = await getSessionAgents("2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-00000000000a", fixturesRoot);
    expect(nodes).toEqual([]);
  });

  it("returns null for a session that does not exist", async () => {
    const nodes = await getSessionAgents("does-not-exist", fixturesRoot);
    expect(nodes).toBeNull();
  });

  it("returns null for an unsafe session id rather than touching the filesystem", async () => {
    const nodes = await getSessionAgents("../../etc/passwd", fixturesRoot);
    expect(nodes).toBeNull();
  });
});