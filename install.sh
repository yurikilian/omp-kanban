#!/usr/bin/env bash
# omp-kanban installer
#
# Copies the kanban agents and skill into an omp discovery root.
#
#   ./install.sh                  install for the current user (~/.omp/agent)
#   ./install.sh --project        install into ./.omp for this repo only
#   ./install.sh --with-dashboard also install the session-start dashboard hook
#                                 (vendored web app; runs npm install + build)
#   ./install.sh --uninstall      remove previously installed files
#   ./install.sh --dry-run        show what would happen, change nothing
#
# Combine flags freely, e.g. ./install.sh --project --with-dashboard --dry-run

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCOPE="user"
DRY=0
UNINSTALL=0
DASHBOARD=0

for arg in "$@"; do
  case "$arg" in
    --project)   SCOPE="project" ;;
    --user)      SCOPE="user" ;;
    --with-dashboard) DASHBOARD=1 ;;
    --uninstall) UNINSTALL=1 ;;
    --dry-run|-n) DRY=1 ;;
    -h|--help)   sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

if [ "$SCOPE" = "project" ]; then
  ROOT=".omp"
else
  ROOT="$HOME/.omp/agent"
fi

AGENT_DIR="$ROOT/agents"
SKILLS_DIR="$ROOT/skills"
HOOK_DIR="$ROOT/hooks/pre"
DASHBOARD_DIR="$ROOT/dashboard"

say()  { printf '%s\n' "$*"; }
run()  { if [ "$DRY" -eq 1 ]; then say "  would: $*"; else "$@"; fi; }

AGENTS=$(cd "$SRC/agents" && ls kb-*.md)
# Every directory under skills/ that holds a SKILL.md — discovered, not hardcoded.
SKILLS=$(cd "$SRC/skills" && for d in */; do [ -f "$d/SKILL.md" ] && printf '%s\n' "${d%/}"; done)
AGENT_COUNT=$(printf '%s\n' "$AGENTS" | grep -c .)
SKILL_COUNT=$(printf '%s\n' "$SKILLS" | grep -c .)

# ---------------------------------------------------------------- uninstall
if [ "$UNINSTALL" -eq 1 ]; then
  say "Removing omp-kanban from $ROOT"
  for f in $AGENTS; do
    [ -e "$AGENT_DIR/$f" ] && run rm -f "$AGENT_DIR/$f" && say "  removed $f"
  done
  for s in $SKILLS; do
    if [ -d "$SKILLS_DIR/$s" ]; then
      run rm -rf "$SKILLS_DIR/$s"
      say "  removed skills/$s"
    fi
  done
  if [ -e "$HOOK_DIR/kb-dashboard.ts" ]; then
    run rm -f "$HOOK_DIR/kb-dashboard.ts"
    say "  removed hooks/pre/kb-dashboard.ts"
  fi
  if [ -d "$DASHBOARD_DIR" ]; then
    run rm -rf "$DASHBOARD_DIR"
    say "  removed dashboard/"
  fi
  say "Done. Run /agents in omp and press Ctrl+R to reload."
  say "Note: the dashboard's runtime state (~/.omp/agent/dashboard/, incl."
  say "dashboard.db) is left in place — remove it by hand if you want it gone."
  exit 0
fi

# ------------------------------------------------------------------ install
say "Installing omp-kanban"
say "  source: $SRC"
say "  target: $ROOT"
[ "$DRY" -eq 1 ] && say "  (dry run — nothing will be written)"
say ""

# Warn about name collisions with anything already installed.
COLLISIONS=""
for f in $AGENTS; do
  if [ -e "$AGENT_DIR/$f" ]; then
    if ! cmp -s "$SRC/agents/$f" "$AGENT_DIR/$f"; then
      COLLISIONS="$COLLISIONS $f"
    fi
  fi
done

if [ -n "$COLLISIONS" ]; then
  say "These agents already exist at the target and differ from this copy:"
  for f in $COLLISIONS; do say "    $f"; done
  say ""
  if [ "$DRY" -eq 0 ]; then
    printf 'Overwrite them? [y/N] '
    read -r reply
    case "$reply" in
      [yY]*) : ;;
      *) say "Aborted. Nothing was changed."; exit 1 ;;
    esac
    say ""
  fi
fi

run mkdir -p "$AGENT_DIR" "$SKILLS_DIR"

for f in $AGENTS; do
  run cp "$SRC/agents/$f" "$AGENT_DIR/$f"
  say "  agents/$f"
done

for s in $SKILLS; do
  run mkdir -p "$SKILLS_DIR/$s"
  run cp -R "$SRC/skills/$s/." "$SKILLS_DIR/$s/"
  say "  skills/$s/"
done

# ------------------------------------------------------------- dashboard (opt-in)
if [ "$DASHBOARD" -eq 1 ]; then
  say ""
  say "Installing sessions dashboard (this runs npm install + build)…"
  run mkdir -p "$HOOK_DIR"
  run cp "$SRC/hooks/pre/kb-dashboard.ts" "$HOOK_DIR/kb-dashboard.ts"
  say "  hooks/pre/kb-dashboard.ts"

  # Copy the vendored app, minus anything build-time.
  run rm -rf "$DASHBOARD_DIR"
  run mkdir -p "$DASHBOARD_DIR"
  run rsync -a --exclude node_modules --exclude 'web/dist' --exclude '.DS_Store' \
    "$SRC/dashboard/" "$DASHBOARD_DIR/"
  say "  dashboard/"

  if [ "$DRY" -eq 0 ]; then
    say ""
    say "  building — installing server deps (compiles better-sqlite3)…"
    npm --prefix "$DASHBOARD_DIR/server" install
    say "  installing + building web UI…"
    npm --prefix "$DASHBOARD_DIR/web" install
    npm --prefix "$DASHBOARD_DIR/web" run build
  else
    say "  would: npm install (server, web) + npm run build (web)"
  fi
fi

say ""
if [ "$DASHBOARD" -eq 1 ]; then
  say "Installed $AGENT_COUNT agents, $SKILL_COUNT skills, and the session-start dashboard hook."
else
  say "Installed $AGENT_COUNT agents and $SKILL_COUNT skills."
fi
say ""
say "Next:"
say "  1. omp -p '/agents'     — confirm the 10 kb-* agents resolved,"
say "                            and that they loaded from $AGENT_DIR."
say "  2. omp -p '/extensions' — confirm the kanban-cycle and cost-forensics skills loaded."
say "  3. Ctrl+R inside /agents reloads from disk after an edit."
say "  4. Add .kanban/ to your .gitignore — cycle artifacts live there."
say ""
if [ "$DASHBOARD" -eq 1 ]; then
  say "Dashboard:"
  say "  It launches automatically on the next omp session start, on a random free"
  say "  port, as a single shared daemon across all sessions. The URL is printed"
  say "  into the session; state lives in ~/.omp/agent/dashboard/state.json."
  say "  Set OMP_KANBAN_DASHBOARD_OPEN=1 to also open a browser tab on fresh start."
  say "  Stop it with: kill \$(python3 -c \"import json;print(json.load(open('$HOME/.omp/agent/dashboard/state.json'))['pid'])\")"
  say ""
fi
say "Smoke test (cheap, no code written):"
say "  Ask omp: \"use the kanban-cycle skill to plan a fix for <small issue>\""
say "  It should dispatch kb-intake and stop for your confirmation before planning."
