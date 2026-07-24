// omp-kanban — flags a QA report that never verified rendered geometry.
//
// Why this exists. A cycle reported 70 passing tests and 30 acceptance criteria
// met, then shipped three user-visible defects: icons at roughly 215px, a pane
// rendered 0px wide, and a stale build. Two of the three were geometry or
// restored-state failures that a structural assertion cannot see. QA spent 1.2%
// of the cycle budget and never checked either category, so the report said
// "pass" while naming no gap — which is the part that let it through review.
//
// A report that records what it could NOT verify is far more useful than one
// that quietly implies it verified everything. This nudges toward the former.
//
// Binding: `tool_result`, filtered to a write of `qa-report.json`. There is no
// `qa_complete` event in omp — the documented surfaces are session_*, agent_*,
// turn_*, context, tool_call, and tool_result. Binding to an invented event
// would load without error and silently never fire, so this uses the real one
// and keys off the artifact the QA agent actually writes.
//
// This never alters the tool result. It returns nothing, so the write proceeds
// untouched; the message is advisory.
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

// Signals that a report engaged with resolved styling or restored state at all.
// Matched case-insensitively against the serialized report.
const GEOMETRY_SIGNALS = [
  "getcomputedstyle",
  "computed style",
  "computed_style",
  "geometry",
  "rendered geometry",
  "screenshot",
  "visual regression",
  "bounding",
];

const STATE_SIGNALS = [
  "out-of-bounds",
  "out of bounds",
  "persisted",
  "restored",
  "clamp",
  "edge case",
  "edge_case",
];

export default function hook(pi: HookAPI): void {
  pi.on("tool_result", async (event) => {
    try {
      if (event.isError) return;

      const toolName = typeof event.toolName === "string" ? event.toolName : "";
      if (toolName !== "write" && toolName !== "edit") return;

      const input: unknown = event.input;
      if (!input || typeof input !== "object") return;

      let targetPath = "";
      if ("path" in input && typeof input.path === "string") {
        targetPath = input.path;
      }
      if (!targetPath.endsWith("qa-report.json")) return;

      let body = "";
      if ("content" in input && typeof input.content === "string") {
        body = input.content;
      } else if ("input" in input && typeof input.input === "string") {
        body = input.input;
      }
      if (body.length === 0) return;

      const haystack = body.toLowerCase();
      const sawGeometry = GEOMETRY_SIGNALS.some((signal) => haystack.includes(signal));
      const sawState = STATE_SIGNALS.some((signal) => haystack.includes(signal));
      if (sawGeometry && sawState) return;

      // Only nag when the report actually claims success. A failing report is
      // already routing defects back and does not need the reminder.
      if (!/"verdict"\s*:\s*"(pass|passed|green)"/i.test(body)) return;

      const missing: string[] = [];
      if (!sawGeometry) missing.push("rendered geometry (getComputedStyle / screenshot)");
      if (!sawState) missing.push("restored state with out-of-bounds values");

      pi.sendMessage(
        `🔍 QA report passed without recording: ${missing.join("; ")}.\n` +
          `   Both categories have shipped defects past a green suite here. If a ` +
          `criterion was checked structurally only, record it as a gap rather ` +
          `than as covered — see the \`rendered-geometry-tests\` skill.`,
      );
    } catch {
      // Advisory only; never interfere with the tool result.
    }
  });
}
