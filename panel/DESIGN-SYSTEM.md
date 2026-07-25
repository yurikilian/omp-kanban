# OMP Prism Design System

## Design System for an Oh My Pi Session, Agent, Configuration, and Audit Dashboard

## 1. Product Vision

This dashboard should not feel like a generic admin panel with agent data placed inside it.

It should be designed specifically for:

- Agent sessions
- Execution timelines
- Agent and subagent hierarchies
- Prompt and response inspection
- Tool call analysis
- Cost and token observability
- Configuration management
- Audit findings

The best visual direction is a combination of:

- **ChatGPT or Claude** for conversation readability
- **Linear** for navigation and information density
- **Datadog** for observability and operational clarity

The interface should feel like a **visual debugger for multi-agent systems**, not merely a dashboard containing chat messages.

---

## 2. Design Philosophy

The product should feel:

- Technical, but not like a hacker terminal
- Dense, but readable
- Colorful only where color communicates meaning
- Comfortable for long-running sessions
- Trustworthy for audits
- Fast and local-first
- Optimized for developers

### Design System Name

**OMP Prism**

The name reflects how one execution is decomposed into:

- Agents
- Subagents
- Events
- Tool calls
- Costs
- Decisions
- Errors
- Audit findings

### Core Visual Principle

The interface should have three visual layers:

1. **Neutral application chrome**
   - Navigation
   - Panels
   - Backgrounds
   - Layout structure

2. **Semantic execution content**
   - User prompts
   - Agent responses
   - Tool calls
   - Delegations
   - Errors
   - Status events
   - Audit findings

3. **Agent identity**
   - Agent colors
   - Agent avatars
   - Tree branches
   - Timeline lanes
   - Graph series

These layers must not compete with each other.

---

## 3. Visual Foundation

### 3.1 Backgrounds and Surfaces

Avoid pure black. Pure black removes surface hierarchy and forces every element to use visible borders.

Use slightly elevated dark surfaces instead.

```css
:root {
  --background: 220 20% 98%;
  --foreground: 222 30% 10%;

  --surface-1: 0 0% 100%;
  --surface-2: 220 18% 96%;
  --surface-3: 220 15% 93%;

  --border: 220 14% 88%;
  --muted: 220 15% 95%;
  --muted-foreground: 220 9% 43%;

  --primary: 217 91% 56%;
  --primary-foreground: 0 0% 100%;

  --radius: 0.625rem;
}

.dark {
  --background: 225 16% 7%;
  --foreground: 220 18% 92%;

  --surface-1: 224 15% 9%;
  --surface-2: 224 14% 12%;
  --surface-3: 224 13% 15%;

  --border: 220 11% 19%;
  --muted: 224 13% 13%;
  --muted-foreground: 218 10% 61%;

  --primary: 213 94% 68%;
  --primary-foreground: 224 20% 8%;
}
```

Hierarchy should come primarily from:

- Position
- Spacing
- Typography
- Surface contrast
- Selective borders

### 3.2 Primary Color

Use blue only for:

- Primary actions
- Active navigation
- Links
- Focus rings
- Selected states

Do not use the primary blue as the main agent identity color. Interactive states and agent identity should remain visually separate.

---

## 4. Agent Color System

Every agent should have a consistent visual identity throughout a session.

| Agent Family | Color | Suggested Meaning |
|---|---|---|
| Coordinator / Root | Cyan Blue | Main execution owner |
| Planner | Violet | Planning and decomposition |
| Developer | Green | Implementation |
| Reviewer | Amber | Review and critique |
| QA | Pink | Testing and validation |
| Research | Teal | Reading and investigation |
| Fixer | Orange | Corrections and remediation |
| Unknown / Custom | Gray | Fallback |

```css
--agent-blue: 199 89% 55%;
--agent-violet: 263 83% 68%;
--agent-green: 151 65% 52%;
--agent-amber: 39 92% 58%;
--agent-pink: 330 81% 65%;
--agent-teal: 174 67% 47%;
--agent-orange: 24 94% 60%;
--agent-gray: 218 11% 60%;
```

### Agent Color Rules

Do not fill entire cards with agent colors.

Use agent colors for:

- Avatar accents
- A 2–3 px side rail
- Agent badges
- Tree connectors
- Timeline lanes
- Small active-state glow
- Chart series
- Temporary focus highlights

Every agent should also have:

- Name
- Icon or monogram
- Role
- Hierarchical path
- Status

Color must never be the only differentiator.

Example:

```text
Planner
P
root / planning / planner-01
```

---

## 5. Main Application Shell

Use a persistent, resizable application shell.

```text
┌───────────────────────────────────────────────────────────────┐
│ Global bar: project, daemon, search, theme, connection       │
├──────────────┬────────────────────┬───────────────────────────┤
│ App nav      │ Context panel      │ Main workspace            │
│ 64–208 px    │ 280–360 px         │ Flexible                  │
└──────────────┴────────────────────┴───────────────────────────┘
```

### 5.1 Global Bar

The top bar should contain:

- Project name
- Daemon status
- Local connection status
- Global search
- Command palette trigger
- Theme switch
- Optional runtime indicator

### 5.2 Application Navigation

Primary sections:

- Sessions
- Agents
- Observability
- Audits
- Configurations

Recommended widths:

- Collapsed: `64px`
- Expanded: `208px`

The expanded state should be persisted locally.

### 5.3 Context Panel

The secondary panel changes depending on the selected section.

For Sessions:

- Search
- Filters
- Saved views
- Pinned sessions
- Session list
- Time grouping

For Agents:

- Agent tree
- Role filters
- Model filters
- Status filters

For Audits:

- Audit runs
- Findings
- Severity filters
- Resolution states

### 5.4 Main Workspace

The main workspace should host:

- Session timeline
- Conversation view
- Agent detail
- Observability dashboards
- Audit detail
- Configuration forms

---

## 6. Session Experience

Sessions are the center of the product.

### 6.1 Recommended Layout

```text
┌───────────────┬──────────────────────────────────────┬──────────────┐
│ Session list  │ Conversation / execution timeline    │ Inspector    │
│               │                                      │              │
│ Filters       │ Session header                       │ Event detail │
│ Saved views   │ Messages and events                  │ Agent info   │
│ Sessions      │                                      │ Raw JSON     │
└───────────────┴──────────────────────────────────────┴──────────────┘
```

The inspector should be collapsible and should become a sheet or drawer on narrower screens.

### 6.2 Session Header

Avoid a large row of narrow KPI cards.

Use a compact header:

```text
Fix dashboard scrolling and styling issues
Completed · Jul 24, 11:10 PM · 18m 42s

$41.60     878K input     431K output     26 agents     1,018 tools
```

Recommended tabs:

```text
Overview | Conversation | Agents | Tools | Cost | Audit
```

The first viewport should prioritize understanding the session, not displaying decorative metrics.

---

## 7. Hybrid Timeline: Chat and Execution

Not every event is a chat message.

The timeline must support multiple semantic event types.

### 7.1 User Prompt

The user prompt should be visually similar to ChatGPT or Claude:

- Limited reading width
- Distinct but subtle background
- Clear author label
- Timestamp
- Actions on hover
- No oversized bubble styling

```text
YOU                                          20:56
Implement a session viewer that streams events...
```

### 7.2 Agent Response

Agent responses should show:

- Agent avatar
- Agent name
- Model
- Timestamp
- Agent color rail

```text
● Planner · Claude Opus 4.8                 20:57

I’ll first inspect the session format and divide...
```

Metadata should remain secondary:

```text
12.4s · 5.8K tokens · $0.08
```

### 7.3 Tool Call

Tool calls should not look like normal messages.

Collapsed:

```text
⌄  bash   Inspecting session schema               345 ms   ✓
```

Expanded:

```text
Input
cat ~/.omp/sessions/abc/session.jsonl

Output
{ ... }

cwd      ~/projects/omp-dashboard
exit     0
duration 345 ms
```

Use a monospace font only inside:

- Commands
- Code
- JSON
- Raw tool input
- Raw tool output

Do not use a monospace font for the entire interface.

### 7.4 Subagent Delegation

Delegation events need a dedicated visual treatment.

```text
Planner
  └─ delegated to Developer #2
     Task: Implement timeline virtualization
```

A delegation event should support:

- Jumping to the subagent start
- Opening the subagent in split view
- Filtering the timeline by branch
- Highlighting the branch in the agent tree

### 7.5 System and Status Events

Examples:

```text
Session started
Context compacted
Model changed
Agent waiting
Session resumed
```

These should appear as compact separators, not full cards.

### 7.6 Errors

```text
! Tool execution failed
  Process exited with code 1
```

Use red only for:

- Icon
- Key border
- Important failure text

Avoid large red backgrounds.

### 7.7 Audit Findings

```text
HIGH · Repeated repository scan

The same directory was scanned 7 times by three agents.

Potential saving: approximately 18K input tokens
```

Audit findings should link to the exact related events.

---

## 8. Progressive Density

Long agent sessions create a large amount of visual noise.

Support three density levels.

### Compact

```text
20:58  Planner    read    Reading intake contract          4ms
20:58  Planner    task    Dispatching developer            16ms
20:59  Developer  bash    Running tests                     8.2s
```

### Comfortable

Show:

- Event title
- Short preview
- Agent identity
- Duration
- Status
- Collapsible detail

This should be the default.

### Expanded

Show:

- Full prompt
- Full response
- Tool input and output
- Token details
- Model metadata
- Raw event metadata

### Visibility Filters

```text
Show:
[✓] Messages
[✓] Agent activity
[✓] Tool calls
[ ] Internal metadata
[ ] Raw events
```

### Automatic Event Grouping

Collapse repetitive operations:

```text
▸ 14 file reads by Developer #2 · 8.4s
▸ 7 shell commands · 18.2s
▸ 23 test events · 1m 42s
```

This is critical for making long sessions usable.

---

## 9. Agent Tree and Execution Hierarchy

Do not rely only on a plain text tree.

### 9.1 Agent Card

```text
┌──────────────────────────────────────┐
│ ● Planner                            │
│   Claude Opus 4.8 · planning         │
│                                      │
│   2m 18s   34K tokens   $1.22        │
│   ━━━━━━━━━━━━━ active               │
└──────────────────────────────────────┘
```

### 9.2 Compact Tree

```text
● Root Agent                         completed
├── ● Intake                        completed
├── ● Planner                       completed
│   ├── ● Developer 1               completed
│   ├── ● Developer 2               failed
│   └── ● Reviewer                  running
└── ● Forensics                     queued
```

### 9.3 Agent States

Each state should have text and iconography:

- Queued
- Running
- Waiting
- Completed
- Failed
- Cancelled
- Interrupted

Do not communicate status only through color.

### 9.4 Multiple Agent Views

Provide three modes:

```text
Tree | Timeline | Graph
```

#### Tree

Best for hierarchy.

#### Timeline

Best for concurrency:

```text
Root       ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Planner      ━━━━━━━
Developer 1          ━━━━━━━━━━━
Developer 2          ━━━━━━━
Reviewer                       ━━━━━
```

#### Graph

Useful for complex sessions with many dependencies.

Graph view should not be the default.

---

## 10. Card System

Avoid placing every element inside a bordered rectangle.

Define clear surface levels.

### 10.1 Structural Surface

For layout areas without heavy borders:

```tsx
<div className="rounded-xl bg-surface-1">
```

### 10.2 Standard Card

For independent information blocks:

```tsx
<Card className="border-border/70 bg-surface-1 shadow-none">
```

### 10.3 Interactive Card

For selectable sessions, agents, and findings:

```tsx
<Card
  className="
    border-border/70 bg-surface-1
    transition-colors
    hover:bg-surface-2
    data-[selected=true]:border-primary/50
    data-[selected=true]:bg-primary/5
  "
>
```

### 10.4 Emphasis Card

Use only for:

- Important decisions
- Warnings
- Audit findings
- Critical KPIs

Avoid heavy shadows in dark mode.

Use surface contrast and selective borders instead.

---

## 11. KPI Design

KPI cards should answer a question, not only display a number.

Weak:

```text
Total Cost
$292.42
```

Better:

```text
Total cost
$292.42
↑ 18% versus the previous 24 sessions
```

Or:

```text
Cost efficiency
$0.031 per completed task
Healthy
```

### Global KPIs

Recommended:

- Total cost
- Cost by model
- Cost by agent role
- Input/output ratio
- Cache hit rate
- Tool failure rate
- Repeated work
- Median session duration
- Parallelism
- Sessions requiring intervention

### Session KPIs

Recommended:

- Cost
- Wall-clock time
- Active compute time
- Input tokens
- Output tokens
- Tool calls
- Agent count
- Failed events
- Context compactions
- Estimated waste

### Layout Rule

Show at most four large KPI cards in the first row.

Secondary metrics should appear in:

- Inline metric strips
- Tables
- Charts
- Detail panels

---

## 12. Observability

The observability page should not be only a table.

### 12.1 Main Sections

```text
Overview
├── Cost
├── Tokens
├── Models
├── Agents
├── Tools
└── Reliability
```

### 12.2 First Viewport

```text
$292.42 total cost     5.5M tokens     6.2% failures     24 sessions
```

Then:

```text
Cost over time                  Cost by model
[line chart]                    [stacked bars]
```

Then:

```text
Most expensive sessions
Most expensive agents
Repeated operations
Tool failures
```

### 12.3 Session Table

The session table should support:

- Sorting
- Column picker
- Saved views
- Sticky header
- Row selection
- Filters
- Density control
- Session comparison

Numeric values should be right-aligned.

Use tabular numbers:

```css
font-variant-numeric: tabular-nums;
```

---

## 13. Audit Experience

Audits should be a first-class workflow, not another log page.

### 13.1 Structure

```text
Audit run
├── Summary
├── Findings
├── Evidence
├── Recommendations
└── Estimated savings
```

### 13.2 Finding Card

```text
HIGH
Repeated context loading

Three agents independently loaded the same 42 files.

Evidence
7 linked event groups

Impact
Approximately 94K repeated input tokens
Approximately $0.84 estimated cost

Recommendation
Create a shared repository context artifact.
```

### 13.3 Finding States

```text
Open
Acknowledged
Fixed
Ignored
Regression
```

Each finding should link to:

- Session
- Agent
- Tool call
- Timeline position
- Responsible configuration

---

## 14. Configuration Experience

Avoid presenting all configuration as a flat table.

Split settings into:

```text
Models
Agents
Runtime
Limits
Storage
Appearance
Advanced
```

### 14.1 Model Role Card

```text
Planning
Used for high-level decomposition and architecture.

Model        Claude Opus 4.8
Reasoning    High
Fallback     Claude Sonnet 5

Estimated relative cost   $$$$
```

Each setting should expose:

- Modified state
- Source file
- Effective value
- Reset action
- Restart requirement

Example:

```text
Effective value
Claude Opus 4.8

Defined by
~/.omp/config.json

[Reset override]
```

### 14.2 Configuration Precedence

The interface should clearly explain:

```text
Global role → Agent default → Project override → Session override
```

Users must be able to understand which model will actually run.

---

## 15. Typography

Recommended fonts:

```text
UI: Inter Variable or Geist Sans
Code and JSON: JetBrains Mono or Geist Mono
```

Suggested type scale:

```css
--text-xs: 0.75rem;
--text-sm: 0.8125rem;
--text-base: 0.875rem;
--text-md: 1rem;
--text-lg: 1.125rem;
--text-xl: 1.375rem;
--text-2xl: 1.75rem;
```

A `14px` base size works well for this product when:

- Metadata uses 12–13 px
- Long-form responses use 15–16 px
- Line height remains comfortable
- Reading width is limited

Chat messages should not span an entire ultrawide screen.

```tsx
className="mx-auto w-full max-w-4xl"
```

Tool output and tables can use more width.

---

## 16. Spacing and Radius

### Spacing Scale

```text
4 px   Micro spacing
8 px   Inline spacing
12 px  Component spacing
16 px  Card spacing
24 px  Section spacing
32 px  Page spacing
```

### Radius Scale

```text
6 px   Inputs and badges
8 px   Compact events
10 px  Cards
12 px  Panels
```

Avoid excessive rounding. This is a technical product, not a social application.

---

## 17. Component Architecture

```text
components/
├── primitives/
│   ├── button
│   ├── badge
│   ├── card
│   ├── input
│   ├── tooltip
│   └── command-menu
├── layout/
│   ├── app-shell
│   ├── app-sidebar
│   ├── context-sidebar
│   ├── inspector-panel
│   └── page-header
├── session/
│   ├── session-list-item
│   ├── session-header
│   ├── session-kpi-strip
│   ├── event-stream
│   ├── event-group
│   └── event-filters
├── events/
│   ├── prompt-event
│   ├── response-event
│   ├── tool-call-event
│   ├── delegation-event
│   ├── status-event
│   ├── error-event
│   └── audit-event
├── agents/
│   ├── agent-avatar
│   ├── agent-badge
│   ├── agent-tree
│   ├── agent-node
│   ├── agent-timeline
│   └── agent-inspector
├── metrics/
│   ├── metric-card
│   ├── metric-inline
│   ├── cost-chart
│   └── token-breakdown
└── audit/
    ├── finding-card
    ├── severity-badge
    └── evidence-link
```

---

## 18. Event Component Pattern

Use a shared frame for all event types.

```tsx
type EventFrameProps = {
  agent?: AgentIdentity;
  icon: React.ReactNode;
  label: string;
  timestamp: string;
  duration?: string;
  status?: "running" | "success" | "error" | "waiting";
  compact?: boolean;
  children?: React.ReactNode;
};
```

Recommended structure:

```text
agent rail | icon | header metadata
           |      content
           |      footer actions
```

The agent rail helps users follow one execution branch without painting entire cards.

---

## 19. Recommended shadcn/ui Components

Use shadcn/ui as a foundation, not as the final visual identity.

Recommended components:

- `ResizablePanelGroup` for the three-panel layout
- `ScrollArea` for sidebars and long lists
- `Command` for global search
- `Tabs` for session sections
- `Collapsible` for tool calls
- `Sheet` for mobile inspectors
- `Tooltip` for icon-only controls
- `DropdownMenu` for actions
- `ContextMenu` for timeline actions
- `HoverCard` for agents and models
- `Table` with TanStack Table
- `Badge` with custom semantic variants
- `Skeleton` for streamed content
- `Sonner` for notifications

Do not use `Card` as the wrapper for every element.

---

## 20. Important Interaction Patterns

### 20.1 Command Palette

Use `Cmd + K` or `Ctrl + K`.

Suggested actions:

```text
Open session…
Open agent…
Filter by model…
Go to configuration…
Toggle compact mode
Show failed tool calls
```

### 20.2 Deep Linking

Selecting an agent should:

- Select the agent in the tree
- Highlight related timeline events
- Open the inspector
- Update the URL

Example:

```text
/sessions/:sessionId?agent=planner-01&event=evt-842
```

This makes exact problems shareable.

### 20.3 Streaming Behavior

While a session is running:

- Running events should use a subtle activity indicator
- Auto-scroll should only remain active when the user is already at the bottom
- Show a `Jump to live` button when the user scrolls upward
- Never force scroll while the user is inspecting earlier events

### 20.4 Keyboard Navigation

```text
J / K        Previous or next event
Enter        Expand event
Shift+Enter  Open in inspector
F            Filter by selected agent
E            Show only errors
T            Show only tool calls
Esc          Clear selection
```

---

## 21. Problems to Remove From the Current Design

The new design should avoid:

- A permanently wide sidebar
- Heavy border usage
- KPI rows made from many narrow boxes
- Tables used for every type of information
- Very small low-contrast labels
- Full-width chat messages on ultrawide screens
- Uniform timeline rows with no semantic distinction
- Session metadata placed in visually disconnected locations
- Mixing status, agent, action, and duration at the same hierarchy level
- Pure black backgrounds across the entire application
- Identical styling for prompts, responses, tool calls, and delegations

---

## 22. Initial Screen Scope

Start with five screens.

### 1. Sessions

Session list, execution timeline, and inspector.

### 2. Session Overview

Summary, agents, cost, duration, errors, and findings.

### 3. Agents

Configured agents, roles, models, and execution history.

### 4. Observability

Costs, tokens, models, tools, errors, and estimated waste.

### 5. Configurations

Model roles, overrides, runtime settings, and precedence.

Audits can initially live inside the session detail and later become a dedicated top-level section.

---

## 23. Final Visual Direction

The target visual identity should include:

```text
Dark graphite background
Warm-neutral elevated surfaces
Blue for interaction
Agent colors on rails, avatars, trees, and charts
Readable chat-like center column
Progressive metadata disclosure
Compact tool-call events
Resizable side panels
Minimal borders
Strong typography
No decorative gradients
No giant dashboard cards
```

The final product should feel like a purpose-built environment for inspecting and debugging multi-agent execution.

It should not feel like a generic dashboard with a chat panel added afterward.
