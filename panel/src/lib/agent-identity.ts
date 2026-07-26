/**
 * OMP Prism agent identities from DESIGN-SYSTEM.md section 4.
 *
 * Agent data may name the root coordinator as "root" and custom agents as
 * "custom"; both aliases intentionally resolve to their documented family.
 */
export type AgentFamily =
  | "coordinator"
  | "planner"
  | "developer"
  | "reviewer"
  | "qa"
  | "research"
  | "fixer"
  | "unknown";

export interface AgentIdentity {
  family: AgentFamily;
  label: string;
  accentToken: `--agent-${string}`;
}

export const AGENT_IDENTITIES: Record<AgentFamily, AgentIdentity> = {
  coordinator: {
    family: "coordinator",
    label: "Coordinator",
    accentToken: "--agent-blue",
  },
  planner: {
    family: "planner",
    label: "Planner",
    accentToken: "--agent-violet",
  },
  developer: {
    family: "developer",
    label: "Developer",
    accentToken: "--agent-green",
  },
  reviewer: {
    family: "reviewer",
    label: "Reviewer",
    accentToken: "--agent-amber",
  },
  qa: {
    family: "qa",
    label: "QA",
    accentToken: "--agent-pink",
  },
  research: {
    family: "research",
    label: "Research",
    accentToken: "--agent-teal",
  },
  fixer: {
    family: "fixer",
    label: "Fixer",
    accentToken: "--agent-orange",
  },
  unknown: {
    family: "unknown",
    label: "Unknown",
    accentToken: "--agent-gray",
  },
};

const FAMILY_ALIASES: Record<string, AgentFamily> = {
  coordinator: "coordinator",
  root: "coordinator",
  planner: "planner",
  developer: "developer",
  reviewer: "reviewer",
  qa: "qa",
  research: "research",
  fixer: "fixer",
  unknown: "unknown",
  custom: "unknown",
};

export function resolveAgentIdentity(family?: string | null): AgentIdentity {
  const normalized = family?.trim().toLowerCase();
  const resolvedFamily = normalized ? FAMILY_ALIASES[normalized] : undefined;

  return AGENT_IDENTITIES[resolvedFamily ?? "unknown"];
}
