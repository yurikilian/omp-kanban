#!/usr/bin/env bash
# omp-kanban installer
#
# Copies the kanban agents and skill into an omp discovery root.
#
#   ./install.sh              install for the current user (~/.omp/agent)
#   ./install.sh --project    install into ./.omp for this repo only
#   ./install.sh --uninstall  remove previously installed files
#   ./install.sh --dry-run    show what would happen, change nothing
#
# Combine flags freely, e.g. ./install.sh --project --dry-run

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCOPE="user"
DRY=0
UNINSTALL=0

for arg in "$@"; do
  case "$arg" in
    --project)   SCOPE="project" ;;
    --user)      SCOPE="user" ;;
    --uninstall) UNINSTALL=1 ;;
    --dry-run|-n) DRY=1 ;;
    -h|--help)   sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

if [ "$SCOPE" = "project" ]; then
  ROOT=".omp"
else
  ROOT="$HOME/.omp/agent"
fi

AGENT_DIR="$ROOT/agents"
SKILL_DIR="$ROOT/skills/kanban-cycle"

say()  { printf '%s\n' "$*"; }
run()  { if [ "$DRY" -eq 1 ]; then say "  would: $*"; else "$@"; fi; }

AGENTS=$(cd "$SRC/agents" && ls kb-*.md)

# ---------------------------------------------------------------- uninstall
if [ "$UNINSTALL" -eq 1 ]; then
  say "Removing omp-kanban from $ROOT"
  for f in $AGENTS; do
    [ -e "$AGENT_DIR/$f" ] && run rm -f "$AGENT_DIR/$f" && say "  removed $f"
  done
  if [ -d "$SKILL_DIR" ]; then
    run rm -rf "$SKILL_DIR"
    say "  removed skills/kanban-cycle"
  fi
  say "Done. Run /agents in omp and press Ctrl+R to reload."
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

run mkdir -p "$AGENT_DIR" "$SKILL_DIR"

for f in $AGENTS; do
  run cp "$SRC/agents/$f" "$AGENT_DIR/$f"
  say "  agents/$f"
done

run cp "$SRC/skills/kanban-cycle/SKILL.md" "$SKILL_DIR/SKILL.md"
say "  skills/kanban-cycle/SKILL.md"

say ""
say "Installed 10 agents and 1 skill."
say ""
say "Next:"
say "  1. omp -p '/agents'     — confirm the 10 kb-* agents resolved,"
say "                            and that they loaded from $AGENT_DIR."
say "  2. omp -p '/extensions' — confirm the kanban-cycle skill loaded."
say "  3. Ctrl+R inside /agents reloads from disk after an edit."
say "  4. Add .kanban/ to your .gitignore — cycle artifacts live there."
say ""
say "Smoke test (cheap, no code written):"
say "  Ask omp: \"use the kanban-cycle skill to plan a fix for <small issue>\""
say "  It should dispatch kb-intake and stop for your confirmation before planning."
