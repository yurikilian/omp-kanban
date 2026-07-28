"use client";

import { useEffect, useState } from "react";
import { agentIdFromSearchParam, eventIdFromSearchParam, SESSION_URL_CHANGE_EVENT, sessionAgentUrl } from "@/lib/session-url";
import type { AgentHierarchyNode } from "@/server/sessions/agents";
import { AgentNode } from "./agent-node";

export interface AgentTreeProps {
  sessionId: string;
}

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; nodes: AgentHierarchyNode[] };

function renderBranch(
  node: AgentHierarchyNode,
  depth: number,
  selectedAgentId: string | undefined,
  onSelect: (agentId: string) => void,
) {
  return (
    <div key={node.path.join("/")} data-slot="agent-branch">
      <button
        type="button"
        aria-label={`Scope timeline to ${node.name}`}
        aria-pressed={selectedAgentId === node.name}
        className="block w-full text-left"
        onClick={() => onSelect(node.name)}
      >
        <AgentNode
          name={node.name}
          path={node.path}
          parentUnknown={node.parentUnknown}
          depth={depth}
          status={node.status}
          durationMs={node.metrics.durationMs}
          inputTokens={node.metrics.inputTokens}
          outputTokens={node.metrics.outputTokens}
          costUsd={node.metrics.costUsd}
        />
      </button>
      {node.children.map((child) => renderBranch(child, depth + 1, selectedAgentId, onSelect))}
    </div>
  );
}

/**
 * Loads and renders one session's agent hierarchy - the main agent and
 * every sub-agent it spawned, each nested under its own spawner
 * (E3-S8-AC1). Fetches its own data (rather than receiving it as a prop),
 * mirroring `EventStream`'s lifecycle, since the hierarchy is a
 * self-contained section of the session detail page.
 *
 * A session that spawned no sub-agents renders a plain explanation instead
 * of an empty tree container (E3-S8-AC4) - there is nothing to nest, so
 * showing the single coordinator alone would not be a "hierarchy" either.
 */
export function AgentTree({ sessionId }: AgentTreeProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return agentIdFromSearchParam(new URLSearchParams(window.location.search).get("agent"));
  });
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    fetch(`/api/sessions/${sessionId}/agents`)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load agents: ${response.status}`);
        return response.json() as Promise<AgentHierarchyNode[]>;
      })
      .then((nodes) => {
        if (!cancelled) setState({ status: "ready", nodes });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    const updateSelection = () => {
      setSelectedAgentId(agentIdFromSearchParam(new URLSearchParams(window.location.search).get("agent")));
    };

    window.addEventListener("popstate", updateSelection);
    window.addEventListener(SESSION_URL_CHANGE_EVENT, updateSelection);
    return () => {
      window.removeEventListener("popstate", updateSelection);
      window.removeEventListener(SESSION_URL_CHANGE_EVENT, updateSelection);
    };
  }, []);

  const selectAgent = (agentId: string) => {
    const eventId = eventIdFromSearchParam(new URLSearchParams(window.location.search).get("event"));
    window.history.replaceState(window.history.state, "", sessionAgentUrl(sessionId, agentId, eventId));
    window.dispatchEvent(new Event(SESSION_URL_CHANGE_EVENT));
  };

  const content =
    state.status === "loading" ? (
      <p className="text-sm text-muted-foreground">Loading agent hierarchy…</p>
    ) : state.status === "error" ? (
      <p className="text-sm text-muted-foreground">Failed to load the agent hierarchy.</p>
    ) : state.nodes.length === 0 ? (
      <p className="text-sm text-muted-foreground">This session has no sub-agents.</p>
    ) : (
      <div data-slot="agent-tree" className="flex flex-col gap-1">
        {state.nodes.map((node) => renderBranch(node, 0, selectedAgentId, selectAgent))}
      </div>
    );

  return (
    <section aria-labelledby="agent-hierarchy-heading" data-slot="agent-hierarchy" className="space-y-1">
      <h2 id="agent-hierarchy-heading" className="text-sm font-semibold text-foreground">
        Agent hierarchy
      </h2>
      {content}
    </section>
  );
}