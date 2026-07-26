import type { ComponentProps } from "react";
import { resolveAgentIdentity } from "@/lib/agent-identity";
import { cn } from "@/lib/utils";
import "@/styles/agents.css";

export type AgentBadgeProps = Omit<ComponentProps<"span">, "children"> & {
  family?: string | null;
};

export function AgentBadge({ family, className, ...props }: AgentBadgeProps) {
  const identity = resolveAgentIdentity(family);

  return (
    <span
      {...props}
      data-slot="agent-badge"
      data-agent-family={identity.family}
      className={cn("agent-badge", className)}
    >
      <span aria-hidden="true" className="agent-badge__accent" />
      <span className="agent-badge__label">{identity.label}</span>
    </span>
  );
}
