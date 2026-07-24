# Agent Session Viewer Dashboard

A lightweight web dashboard for browsing and analyzing Claude agent sessions created via the CLI. Sessions are discovered from `~/.omp/agent/sessions/`, displayed in a unified timeline view, and managed through configuration panels — all read-only, no session creation from the dashboard.

## Features

- 📊 **Real Session Data**: Loads real agent session transcripts from `~/.omp/agent/sessions/`
- 🔍 **Session List**: Browse all sessions with metadata (timestamp, model, project, statistics)
- 📈 **Detailed Timeline**: Unified, chronological view of conversation turns, tool calls, and nested sub-agent sessions
- 📝 **Plans**: Create, edit, and associate markdown plans with sessions; persisted in SQLite
- ⚙️ **Preferences**: Sidebar width, sort order, and panel state persist across restarts
- 🔧 **Tool Execution Tracking**: Detailed tool calls (write, read, bash, …) with intent and arguments
- 💡 **KPI Cards**: Session statistics (message count, token usage, cost, agent count)
- 🖥️ **Responsive Layout**: Three-column Claude-Desktop-style shell (session rail / timeline / plan panel)

## Quick Start — Development

```bash
# Install dependencies (root, server, web)
npm install
npm --prefix server install
npm --prefix web install

# Start dev servers
npm run dev
# → server on http://localhost:3001, web on http://localhost:5173
```

The dev servers auto-reload on file changes via Vite (web) and Node watch (server).

## Production

```bash
# 1. Build the web bundle — REQUIRED before any production run
npm run build

# 2. Run the server, serving the built UI at :3001
npm start
# → open http://localhost:3001
```

The server scans `~/.omp/agent/sessions/` on startup and serves a read-only dashboard. No session creation or live interaction from the UI — sessions are created entirely via CLI (`omp` commands).

## Architecture

- **Backend**: Express.js (`server/`, port 3001) — filesystem session loading, SQLite persistence for plans/preferences/metadata
- **Frontend**: React + Vite (`web/`, port 5173 in dev) — three-column layout, real-time session list updates via filesystem watch SSE
- **Persistence**: SQLite at `~/.omp/agent/dashboard.db` (override with `DASHBOARD_DB`) — stores plans, session titles, and preferences. Transcripts remain file-derived JSONL; SQLite never touches them
- **Session Discovery**: Server scans `~/.omp/agent/sessions/` on startup and via filesystem watch; all sessions are read-only

## How It Works

1. **Create sessions via CLI**
   ```bash
   cd /path/to/project
   omp                    # Start an interactive session
   ```

2. **Sessions auto-appear in the dashboard**
   - Server discovers session files in `~/.omp/agent/sessions/`
   - Dashboard immediately lists new sessions and their metadata

3. **View and analyze**
   - Browse session timelines with full conversation history
   - Inspect tool calls, nested sub-tasks, and agent interactions
   - View KPI cards (message counts, token usage, cost)
   - Create and link markdown plans for reference

## Testing

```bash
npm test  # server + web suites
```

**Results**: 109 server tests passing, 135 web tests passing (244 total).

## Session Data

Real agent sessions from `~/.omp/agent/sessions/`:
- Session metadata (title, model, timestamp, project status)
- Full conversation transcripts, including nested sub-task sessions
- Tool execution details with intent, arguments, results
- Session statistics (message count, token usage, cost, agent count)

## Requirements

- Node ≥ 18
- `omp` CLI installed (for creating sessions — dashboard only views them)
- Sessions stored in `~/.omp/agent/sessions/` (standard omp location)

## No Longer Supported

- ❌ Electron desktop app (removed)
- ❌ Live agent interaction from dashboard
- ❌ Session creation from dashboard
- ❌ Real-time token streaming UI
