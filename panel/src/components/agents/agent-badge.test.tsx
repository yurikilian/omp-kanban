import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "@/app/globals.css";
import { AgentBadge } from "@/components/agents/agent-badge";

const DESIGN_SYSTEM_IDENTITIES = [
  { family: "coordinator", label: "Coordinator", accentToken: "--agent-blue" },
  { family: "planner", label: "Planner", accentToken: "--agent-violet" },
  { family: "developer", label: "Developer", accentToken: "--agent-green" },
  { family: "reviewer", label: "Reviewer", accentToken: "--agent-amber" },
  { family: "qa", label: "QA", accentToken: "--agent-pink" },
  { family: "research", label: "Research", accentToken: "--agent-teal" },
  { family: "fixer", label: "Fixer", accentToken: "--agent-orange" },
  { family: "unknown", label: "Unknown", accentToken: "--agent-gray" },
] as const;

function renderEveryAgentBadge() {
  return render(
    <>
      {DESIGN_SYSTEM_IDENTITIES.map(({ family }) => (
        <AgentBadge family={family} key={family} />
      ))}
    </>,
  );
}

function badgeFor(family: (typeof DESIGN_SYSTEM_IDENTITIES)[number]["family"]) {
  const badge = document.querySelector<HTMLElement>(
    `.agent-badge[data-agent-family="${family}"]`,
  );

  if (!badge) {
    throw new Error(`badge not rendered for ${family}`);
  }

  return badge;
}

describe("AgentBadge", () => {
  it("E2-S1-AC3: resolves each of the eight families to its own --agent-* accent token", () => {
    renderEveryAgentBadge();
    const resolvedAccents = new Set<string>();

    for (const { family, accentToken } of DESIGN_SYSTEM_IDENTITIES) {
      const badge = badgeFor(family);
      const accent = getComputedStyle(badge)
        .getPropertyValue("--agent-accent")
        .trim();
      const dot = badge.querySelector<HTMLElement>(".agent-badge__accent");

      expect(accent).toBe(`var(${accentToken})`);
      expect(dot).not.toBeNull();
      expect(getComputedStyle(dot!).backgroundColor).toBe(
        "hsl(var(--agent-accent))",
      );
      resolvedAccents.add(accent);
    }

    expect(resolvedAccents.size).toBe(DESIGN_SYSTEM_IDENTITIES.length);
  });

  it("E2-S1-AC3: gives every badge a visible text role label", () => {
    renderEveryAgentBadge();

    for (const { family, label } of DESIGN_SYSTEM_IDENTITIES) {
      const badge = badgeFor(family);
      const labelElement = screen.getByText(label);

      expect(labelElement).toBeVisible();
      expect(badge).toContainElement(labelElement);
    }
  });

  it("E2-S1-AC3: never resolves an agent badge accent to --primary", () => {
    renderEveryAgentBadge();

    for (const { family } of DESIGN_SYSTEM_IDENTITIES) {
      const accent = getComputedStyle(badgeFor(family))
        .getPropertyValue("--agent-accent")
        .trim();

      expect(accent).not.toBe("var(--primary)");
      expect(accent).not.toContain("--primary");
    }
  });
});
