# Build the New Oh My Pi Panel

Create a completely new full-stack Oh My Pi panel inside:

```text
panel/
```

Do not redesign, reskin, or incrementally modify the legacy dashboard.

The new project must be isolated from the old frontend and must not inherit its components, CSS, layouts, navigation structure, timeline implementation, card patterns, table patterns, spacing, typography, colors, interaction patterns, or visual hierarchy.

The legacy implementation may be inspected only to understand domain data, filesystem formats, session behavior, OMP runtime integration, and reusable non-visual business logic.

---

## 1. Design-System Authority

The `panel` folder contains:

```text
panel/DESIGN-SYSTEM.md
```

Read it completely before implementing any UI.

`panel/DESIGN-SYSTEM.md` is the only source of truth for design and UX.

It controls all visual and interaction decisions, including:

- Themes and tokens
- Colors
- Typography
- Spacing
- Surfaces
- Borders
- Shapes
- Cards
- Navigation
- Session layouts
- Event presentation
- Agent identity
- Agent trees
- KPI presentation
- Tables
- Charts
- Responsive behavior
- Accessibility presentation
- Loading states
- Empty states
- Error states

Do not introduce competing visual rules in implementation documentation or component code.

Do not use the legacy dashboard as visual inspiration.

When any visual or UX decision conflicts with `panel/DESIGN-SYSTEM.md`, the design-system file wins.

This prompt defines product behavior, runtime architecture, domain boundaries, audit integration, security, performance, and acceptance criteria only.

---

## 2. Runtime Model

The panel must run through OMP without requiring a separately managed frontend or backend server.

Expected user flow:

```text
Start OMP
→ OMP starts or reuses the panel runtime
→ OMP exposes one localhost URL
→ The browser loads the UI, internal APIs, and live events
→ The runtime shuts down with OMP
```

A local HTTP listener is expected because the panel runs in a browser, but it must be owned and managed by OMP.

The user must not need to:

- Start a separate frontend server
- Start a separate API server
- Run multiple terminal commands
- Manage multiple local ports
- Configure CORS between local services
- Keep another daemon running
- Run `next dev`, `vite`, or equivalent development servers in production

Use one deployable runtime for the panel UI, server-side filesystem access, internal routes, audit jobs, and live updates.

---

## 3. No Legacy API Compatibility Requirement

Do not preserve the legacy dashboard API merely for frontend compatibility.

The new panel may define a new internal contract designed around its actual domain models and workflows.

There is no requirement to retain existing endpoint paths, response shapes, preference keys, or transport decisions.

Reuse existing backend or filesystem logic only when it remains useful and correct.

Do not create compatibility adapters unless another active consumer demonstrably requires them.

The browser still requires a safe server-side boundary for filesystem and OMP runtime access. Implement this boundary inside the same panel runtime using route handlers, server actions, or equivalent framework-owned mechanisms.

Prefer domain-oriented contracts over legacy payloads.

Examples of new internal resources may include:

- Sessions
- Session events
- Agents
- Session metrics
- Audit jobs
- Audit results
- Configuration resolution
- Panel preferences
- Live runtime events

The exact route structure is an implementation decision, but it must remain internal to the single OMP-managed runtime.

---

## 4. Preferred Stack

Preferred stack:

- Next.js with App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Radix primitives where useful
- TanStack Table where advanced tables are required

Use framework-owned server functionality for:

- Reading sessions and timelines
- Reading OMP configuration
- Resolving agent hierarchy
- Aggregating metrics
- Starting and tracking audits
- Serving audit outputs
- Persisting panel preferences
- Streaming live events

A thin custom Node entry point is allowed only when required to:

- Embed the production framework runtime into OMP
- Select an available port
- Print the local URL
- Open the browser
- Reuse an existing panel instance
- Coordinate startup
- Shut down gracefully

It must not become a separately managed service.

A different full-stack framework may be used only when it provides a clearly simpler integration while preserving the same single-runtime behavior.

All UI decisions must follow `panel/DESIGN-SYSTEM.md`.

---

## 5. Production Packaging

The distributed OMP package must contain everything needed to run the panel.

The normal production path must not require:

```text
npm install
npm run dev
next dev
vite
```

Development mode may use framework tooling.

Production must run a built and packaged application.

Package all critical assets locally:

- JavaScript
- CSS
- Fonts
- Icons
- Static files

Do not depend on external CDNs for critical functionality.

---

## 6. Product Scope

The panel is a local operations and inspection interface for:

- Sessions
- Agents
- Subagents
- Prompts
- Agent responses
- Tool calls
- Tool results
- Delegations
- Costs
- Tokens
- Models
- Configurations
- Observability
- Audits
- Errors
- Repeated work
- Estimated waste

Sessions are created through OMP or the CLI.

Do not add unsupported behavior such as:

- Creating sessions from the panel
- Starting arbitrary agents from the panel
- Editing read-only data
- Remote multi-user behavior

The explicit exception is the supported **Generate audit** action described below.

---

## 7. Main Product Areas

Implement:

- Sessions
- Agents
- Observability
- Audits
- Configurations

Their presentation and interaction design must follow `panel/DESIGN-SYSTEM.md`.

---

## 8. Sessions

The Sessions area must support:

- Listing sessions
- Search
- Sorting
- Filtering
- Pinning
- Deletion with confirmation
- Stable selection during refresh
- Loading states
- Empty states
- Error states
- Keyboard selection
- Live updates
- Deep links where practical

The session detail must expose all available:

- Session metadata
- Status
- Duration
- Cost
- Input tokens
- Output tokens
- Agent count
- Tool-call count
- Prompts
- Responses
- Tool calls
- Tool results
- Delegations
- Agent hierarchy
- Errors
- Existing audit results

Do not allow raw filesystem or parser payloads to determine UI component boundaries.

---

## 9. Generate Audit Action

Every eligible session detail must provide a **Generate audit** action.

The action must start an asynchronous cost-forensics audit for the selected session.

It must not run analysis in the browser.

Expected flow:

```text
User selects a session
→ User activates Generate audit
→ Panel creates an audit job
→ OMP dispatches cost-forensics
→ cost-forensics dispatches kb-forensics
→ kb-forensics analyzes the session
→ Audit artifacts are written
→ Panel receives progress updates
→ Completed audit appears in the Audits area and in the session detail
```

The audit action must:

- Use the selected session as an explicit target
- Avoid asking the user to choose the target again
- Allow optional pricing input when no trustworthy pricing snapshot is available
- Never recall provider prices from model memory
- Return a durable audit ID immediately
- Continue asynchronously
- Expose status and progress
- Prevent accidental duplicate audits for the same unchanged session
- Allow a deliberate rerun
- Preserve failed and insufficient-signal audit records
- Surface clear errors
- Link the completed result back to the session

Recommended audit lifecycle:

```text
queued
running
completed
failed
cancelled
insufficient_signal
```

Use an input fingerprint based on the target session and analyzer version.

When a completed audit already exists for the same fingerprint, the panel should offer to open it or explicitly rerun it rather than silently spending tokens again.

---

## 10. Audit Job Service

Implement an internal audit job service inside the panel/OMP runtime.

Responsibilities:

- Create audit IDs
- Resolve the target session safely
- Capture an immutable input fingerprint
- Dispatch the `cost-forensics` skill
- Track job state
- Stream progress
- Validate output artifacts
- Index completed audits
- Recover state after panel restart
- Avoid duplicate concurrent runs
- Record failure details
- Support cancellation only when OMP can do it safely

A possible internal contract is:

```text
POST /internal/audits
GET  /internal/audits/:auditId
GET  /internal/audits/:auditId/events
GET  /internal/sessions/:sessionId/audits
POST /internal/audits/:auditId/cancel
```

These names are not compatibility requirements. Equivalent server actions or framework routes are acceptable.

The job service must not block the primary HTTP request until analysis finishes.

---

## 11. Audit Artifact Contract

`kb-forensics` must produce panel-readable artifacts.

Use this canonical directory by default:

```text
~/.omp/forensics/audits/<audit-id>/
```

Each audit bundle must contain:

```text
manifest.json
audit.json
report.md
evidence.jsonl
```

### `manifest.json`

Contains lifecycle and integrity information:

- Schema version
- Audit ID
- Status
- Target reference
- Project reference when available
- Session reference
- Input fingerprint
- Analyzer name and version
- Created time
- Started time
- Completed time
- Artifact paths
- Failure summary when applicable

### `audit.json`

Canonical structured output consumed by the panel.

It contains:

- Coverage and measurement gaps
- Session totals
- Cost and token breakdowns
- Findings
- Proposals
- Ranking
- Confidence
- Savings ranges
- Evidence references
- Methodology notes

### `report.md`

Human-readable audit report.

It must be generated from the same conclusions as `audit.json`.

The Markdown report must not disagree with the structured output.

### `evidence.jsonl`

One evidence record per line for scalable loading.

Each record should contain:

- Evidence ID
- Session ID
- Event ID or stable event reference
- Agent ID
- Timestamp
- Event type
- Tool name when relevant
- Measured values
- Short explanation
- Safe excerpt or digest
- Source location reference

Do not copy entire large tool outputs into evidence records.

Use bounded excerpts and content hashes where possible.

---

## 12. Audit Structured Schema

Use versioned structured output.

A finding should contain at least:

```json
{
  "id": "finding-id",
  "category": "repeated_context_loading",
  "title": "Repeated repository context loading",
  "severity": "high",
  "confidence": "high",
  "summary": "Three agents loaded substantially overlapping files.",
  "observedImpact": {
    "inputTokens": 94000,
    "outputTokens": 0,
    "cost": null
  },
  "estimatedSavings": {
    "inputTokens": {
      "minimum": 38000,
      "likely": 61000,
      "maximum": 76000
    },
    "cost": null
  },
  "evidenceIds": ["evidence-1", "evidence-2"],
  "causalChain": [],
  "limitations": [],
  "proposalIds": ["proposal-1"]
}
```

A proposal should contain at least:

```json
{
  "id": "proposal-1",
  "type": "hook",
  "title": "Reuse a shared repository context artifact",
  "wastePrevented": ["finding-id"],
  "expectedSavings": {
    "inputTokens": {
      "minimum": 38000,
      "likely": 61000,
      "maximum": 76000
    },
    "cost": null
  },
  "maintenanceCost": "medium",
  "implementationRisk": "low",
  "filesLikelyAffected": [],
  "validationPlan": [],
  "automaticApplicationAllowed": false
}
```

All monetary values must include currency when available.

Use `null`, not guessed values, when pricing is unavailable.

---

## 13. Event Domain Model

Create normalized frontend models for:

- User prompt
- Agent response
- Tool call
- Tool result
- Delegation
- System event
- Status event
- Error
- Audit finding
- Unknown event fallback

Retain available metadata such as:

- ID
- Timestamp
- Agent
- Parent agent
- Model
- Duration
- Status
- Cost
- Input tokens
- Output tokens
- Tool information
- Parent-child relationships
- Raw metadata reference

Unknown event types must remain inspectable and must not crash the panel.

Their visual presentation must follow `panel/DESIGN-SYSTEM.md`.

---

## 14. Agent Domain Model

Create normalized models for:

- Agent identity
- Agent role
- Agent state
- Model assignment
- Parent-child hierarchy
- Delegation relationship
- Duration
- Cost
- Token usage
- Execution status

Support when present:

- Queued
- Running
- Waiting
- Completed
- Failed
- Cancelled
- Interrupted

Agent hierarchy must link to corresponding session events and audit evidence.

Its presentation must follow `panel/DESIGN-SYSTEM.md`.

---

## 15. Observability

Support all reliably available metrics for:

- Cost
- Tokens
- Models
- Agents
- Tools
- Reliability
- Repeated work
- Estimated waste
- Session duration
- Parallelism

Support:

- Aggregation
- Trends
- Filtering
- Sorting
- Session comparison
- Detailed tables where appropriate
- Empty states
- Unavailable-data states

Never fabricate metrics.

All visualizations must follow `panel/DESIGN-SYSTEM.md`.

---

## 16. Audits Area

The Audits area must read the canonical audit bundles.

Support:

- Audit list
- Audit status
- Session relationship
- Coverage
- Measurement gaps
- Cost and token breakdown
- Findings
- Severity
- Confidence
- Evidence
- Proposals
- Estimated savings
- Maintenance cost
- Implementation risk
- Resolution state

Possible resolution states:

- Open
- Acknowledged
- Approved
- Rejected
- Applied
- Verified
- Regression

Evidence must deep-link to the relevant:

- Session
- Agent
- Tool call
- Exact event
- Configuration
- Kanban run when applicable

The panel must clearly separate:

- Observed facts
- Derived measurements
- Estimates
- Inferences
- Unavailable data

Do not expose automatic proposal application unless it is implemented as a separate explicit approval workflow.

The audit presentation must follow `panel/DESIGN-SYSTEM.md`.

---

## 17. Configurations

Expose available configuration for:

- Models
- Agent definitions
- Runtime
- Limits
- Storage
- Appearance
- Advanced settings

Where available, expose:

- Effective value
- Source
- Inheritance
- Override state
- Restart requirement
- Reset-to-inherited behavior

Support configuration precedence:

```text
Global role → Agent default → Project override → Session override
```

Do not imply editability when the underlying value is read-only.

The presentation must follow `panel/DESIGN-SYSTEM.md`.

---

## 18. Filesystem Boundary

Browser components must not access OMP files directly.

Use:

```text
Browser UI
  → local server route or server action
  → domain service or repository
  → OMP filesystem and runtime state
```

Do not expose arbitrary filesystem paths to the browser.

Treat session content, Markdown, tool input, and tool output as untrusted.

Sanitize rendered content.

Never execute session-provided content in the browser.

---

## 19. Local Security

By default:

- Bind to `127.0.0.1`
- Do not expose the panel to the LAN
- Do not use permissive CORS
- Do not transmit session data externally
- Do not load critical resources externally
- Validate route inputs
- Reject unsafe path traversal
- Sanitize rendered Markdown and HTML

Remote binding must require explicit advanced configuration.

---

## 20. Live Updates

Use Server-Sent Events, streamed fetch, or an equivalent single-runtime mechanism.

During session and audit updates:

- Preserve current selection
- Avoid layout jumps
- Do not force-scroll users reading older content
- Auto-scroll only when already near the latest content
- Expose a return-to-live action
- Recover gracefully from temporary stream interruption
- Reconcile job state after reconnect

---

## 21. Deep Linking

Where practical, URL state should identify:

- Current area
- Selected session
- Selected agent
- Selected event
- Selected audit
- Selected finding
- Active view
- Relevant filters

Examples:

```text
/sessions/:sessionId?agent=planner-01&event=evt-842
/audits/:auditId?finding=finding-3&evidence=evidence-18
```

Reloading should restore relevant context.

---

## 22. Accessibility

Implement:

- Accessible names
- Keyboard navigation
- Visible focus
- Correct semantic roles
- Accessible trees
- Accessible tables
- Accessible rendered Markdown
- Accessible code blocks
- Reduced-motion support
- Screen-reader-friendly job progress
- Screen-reader-friendly loading and errors

All visual accessibility rules must follow `panel/DESIGN-SYSTEM.md`.

---

## 23. Loading, Empty, Error, and Disconnected States

Implement explicit states for:

- Application startup
- OMP disconnected
- Session-list loading
- Session-detail loading
- Timeline loading
- No sessions
- No filter matches
- Session fetch failure
- Timeline fetch failure
- Live-update interruption
- Empty agent hierarchy
- No audit findings
- Audit queued
- Audit running
- Audit failed
- Audit cancelled
- Audit insufficient signal
- Invalid audit output
- Configuration unavailable
- Unsupported area

Errors should explain:

- What failed
- Whether existing data remains usable
- Whether retry is possible
- What action is available

Presentation must follow `panel/DESIGN-SYSTEM.md`.

---

## 24. Domain Architecture

Keep framework adapters separate from domain logic.

Create dedicated modules for:

- Panel runtime
- HTTP/framework adapters
- Session repositories
- Timeline parsing
- Event normalization
- Agent-tree construction
- Metrics aggregation
- Audit job management
- Audit artifact validation
- Audit indexing
- Configuration resolution
- Preference persistence
- Live event distribution

Do not pass raw filesystem payloads directly into UI components.

Never fabricate missing data.

---

## 25. Performance

Long sessions and evidence sets may contain thousands of records.

Support:

- Event virtualization when required
- Progressive rendering
- Stable list keys
- Memoized components
- Grouping repetitive events
- Lazy rendering of large tool output
- Lazy evidence loading
- Lazy syntax highlighting
- Minimal rerenders during live updates
- Stable scroll position
- Efficient filtering
- Efficient hierarchy construction
- Streaming audit progress
- Incremental evidence loading

Do not eagerly render entire transcripts, large tool payloads, or complete evidence files.

Do not break chronological reading continuity when virtualizing.

---

## 26. Implementation Order

### Phase 1: Discovery

- Read `panel/DESIGN-SYSTEM.md`
- Inspect session and configuration storage
- Inspect representative transcripts
- Discover schemas before parsing
- Identify live-update behavior
- Identify reusable domain logic
- Inspect the existing `cost-forensics` skill
- Inspect the existing `kb-forensics` agent
- Record unsupported fields and unknowns

Do not inspect the legacy UI for visual inspiration.

### Phase 2: Project and runtime

- Create the project in `panel/`
- Configure the full-stack framework
- Implement the single OMP-managed runtime
- Implement server-side domain boundaries
- Implement live session events
- Implement audit job events
- Implement graceful shutdown
- Implement production packaging

### Phase 3: Domain foundation

- Create normalized models
- Create session repositories
- Create timeline parsers
- Create agent hierarchy services
- Create metrics services
- Create audit job services
- Create audit artifact schemas and validators
- Create audit index services
- Create configuration services

### Phase 4: User interface

- Implement the application according to `panel/DESIGN-SYSTEM.md`
- Implement Sessions
- Implement Generate audit
- Implement audit progress
- Implement Agents
- Implement Observability
- Implement Audits
- Implement Configurations

### Phase 5: Quality

- Accessibility
- Keyboard behavior
- Loading and errors
- Responsive behavior
- Performance review
- Component tests
- Integration tests
- Audit fixture tests
- Invalid-output tests
- Design-system compliance review

---

## 27. Non-Goals

Do not:

- Create the project outside `panel/`
- Modify the legacy frontend into the new panel
- Copy legacy visual code
- Add design rules that compete with `panel/DESIGN-SYSTEM.md`
- Create another design system
- Preserve legacy API shapes without a demonstrated consumer
- Add a separately managed frontend server
- Add a separately managed API server
- Require development servers in production
- Run audits in browser code
- Block an HTTP request until an audit completes
- Silently rerun an unchanged audit
- Fabricate cost, token, energy, or carbon numbers
- Automatically apply audit proposals
- Add fake data
- Add unsupported editing
- Add session creation
- Add arbitrary agent execution controls
- Expose OMP files directly to the browser
- Depend on external CDNs for critical functionality

---

## 28. Deliverables

All new implementation code must live inside:

```text
panel/
```

Deliver:

1. New full-stack panel project
2. OMP-managed single runtime
3. Production packaging
4. New internal domain-oriented server contract
5. Live session streaming
6. Audit job service
7. Audit progress streaming
8. Audit artifact schema and validation
9. Audit indexing and recovery
10. Normalized domain models
11. Session and timeline repositories
12. Agent hierarchy support
13. Sessions area
14. Generate audit action
15. Agents area
16. Observability area
17. Audits area
18. Configurations area
19. Loading, empty, error, disconnected, and audit lifecycle states
20. Deep links
21. Preference persistence
22. Accessibility
23. Long-session performance support
24. Component tests
25. Integration tests
26. Audit fixture tests
27. Runtime and architecture documentation
28. Audit artifact documentation

Do not replace or duplicate `panel/DESIGN-SYSTEM.md`.

---

## 29. Acceptance Criteria

The implementation is complete when:

1. The new project exists inside `panel/`.
2. `panel/DESIGN-SYSTEM.md` is followed as the visual and UX authority.
3. No competing design-system rules are introduced.
4. The legacy dashboard is not used as a visual foundation.
5. The panel runs through OMP using one managed runtime.
6. No separate frontend or API command is required.
7. Production does not require a development server.
8. UI, server-side domain access, live events, and audit jobs use the same managed runtime.
9. The runtime binds to loopback by default.
10. The runtime shuts down cleanly with OMP.
11. The new panel does not preserve legacy APIs without a demonstrated need.
12. Sessions remain stable during refresh.
13. Live session updates work.
14. Session actions supported by the domain work.
15. Every eligible session can start a cost-forensics audit.
16. Audit creation returns immediately with a durable audit ID.
17. Audit status survives panel reload and runtime restart.
18. Duplicate unchanged audits are not silently rerun.
19. `cost-forensics` dispatches `kb-forensics`.
20. `kb-forensics` produces valid `manifest.json`, `audit.json`, `report.md`, and `evidence.jsonl`.
21. Structured audit output passes schema validation.
22. Completed audits appear in the session and Audits area.
23. Failed and insufficient-signal audits remain visible and explain their state.
24. Findings distinguish observation, derivation, estimation, inference, and unavailable data.
25. Pricing is never recalled from model memory.
26. Savings estimates avoid double counting.
27. Proposals are never applied without explicit user approval.
28. Agent and subagent hierarchy is navigable.
29. Audit evidence deep-links to session context.
30. Observability never fabricates unavailable metrics.
31. Long sessions and evidence sets remain performant.
32. Loading, disconnected, error, and audit lifecycle states are implemented.
33. Accessibility and keyboard behavior are covered.
34. Automated tests cover critical behavior.
35. The project builds successfully.
36. The production package contains everything required to run the panel.
37. The final UI complies with `panel/DESIGN-SYSTEM.md`.
