import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/app/globals.css";
import type { AgentHierarchyNode } from "@/server/sessions/agents";
import { AgentTree } from "./agent-tree";

const READY_STATUS = { label: "Completed", basis: "a normal session exit event", derived: true } as const;

function agentNode(overrides: Partial<AgentHierarchyNode> & { name: string; path: string[] }): AgentHierarchyNode {
  return {
    parentUnknown: false,
    status: READY_STATUS,
    metrics: { durationMs: null, inputTokens: null, outputTokens: null, costUsd: null },
    children: [],
    ...overrides,
  };
}

function mockFetchOnce(response: { ok: boolean; status?: number; json?: () => Promise<unknown> }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: response.ok, status: response.status ?? 200, json: response.json ?? (async () => []) }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AgentTree", () => {
  it("requests the session's own agent-hierarchy endpoint", async () => {
    mockFetchOnce({ ok: true, json: async () => [] });

    render(<AgentTree sessionId="session-42" />);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/sessions/session-42/agents"));
  });

  it("shows a loading state before the hierarchy arrives", () => {
    const { promise } = Promise.withResolvers<Response>();
    vi.stubGlobal("fetch", vi.fn(() => promise));

    render(<AgentTree sessionId="session-1" />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows an error state when the hierarchy fails to load", async () => {
    mockFetchOnce({ ok: false, status: 500 });

    render(<AgentTree sessionId="session-1" />);

    expect(await screen.findByText(/failed to load/i)).toBeInTheDocument();
  });

  it("explains that the session spawned no sub-agents, rather than an empty container (E3-S8-AC4)", async () => {
    mockFetchOnce({ ok: true, json: async () => [] });

    const { container } = render(<AgentTree sessionId="session-1" />);

    expect(await screen.findByText(/no sub-agents/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Agent hierarchy" })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="agent-tree"]')).toBeNull();
  });

  it("renders every agent once, nested under the agent that spawned it (E3-S8-AC1)", async () => {
    const tree: AgentHierarchyNode[] = [
      agentNode({
        name: "main",
        path: ["main"],
        children: [
          agentNode({ name: "Worker", path: ["main", "Worker"] }),
          agentNode({
            name: "Planner",
            path: ["main", "Planner"],
            children: [agentNode({ name: "Developer", path: ["main", "Planner", "Developer"] })],
          }),
        ],
      }),
    ];
    mockFetchOnce({ ok: true, json: async () => tree });

    const { container } = render(<AgentTree sessionId="session-1" />);

    await screen.findByText("Developer", { selector: '[data-slot="agent-name"]' });
    const names = Array.from(container.querySelectorAll('[data-slot="agent-name"]')).map((el) => el.textContent);
    expect(names).toEqual(["main", "Worker", "Planner", "Developer"]);

    // Nesting follows the parent branch structurally, not just a visual
    // indentation convention.
    const rootRow = screen.getByText("main", { selector: '[data-slot="agent-name"]' }).closest('[data-slot="agent-node"]') as HTMLElement;
    const plannerRow = screen.getByText("Planner", { selector: '[data-slot="agent-name"]' }).closest('[data-slot="agent-node"]') as HTMLElement;
    const developerRow = screen.getByText("Developer", { selector: '[data-slot="agent-name"]' }).closest('[data-slot="agent-node"]') as HTMLElement;
    const rootBranch = rootRow.closest('[data-slot="agent-branch"]') as HTMLElement;
    const plannerBranch = plannerRow.closest('[data-slot="agent-branch"]') as HTMLElement;
    expect(rootBranch).toContainElement(plannerBranch);
    expect(plannerBranch).toContainElement(developerRow);
  });

  it("also renders an unknown-parent agent placed at the root, marked distinctly (E3-S8-AC6)", async () => {
    const tree: AgentHierarchyNode[] = [
      agentNode({ name: "main", path: ["main"] }),
      agentNode({ name: "Orphan", path: ["Orphan"], parentUnknown: true }),
    ];
    mockFetchOnce({ ok: true, json: async () => tree });

    render(<AgentTree sessionId="session-1" />);

    expect(await screen.findByText("Orphan", { selector: '[data-slot="agent-name"]' })).toBeInTheDocument();
    expect(screen.getByText(/unknown parent/i)).toBeInTheDocument();
  });
});