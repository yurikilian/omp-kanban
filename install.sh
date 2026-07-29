#!/usr/bin/env bash
# omp-kanban installer
#
# Copies the kanban agents and skill into an omp discovery root.
#
#   ./install.sh                  install for the current user (~/.omp/agent)
#   ./install.sh --project        install into ./.omp for this repo only
#   ./install.sh --apply-config   merge the recommended omp settings into
#                                 config.yml (backs it up first; opt-in)
#   ./install.sh --uninstall      remove previously installed files
#   ./install.sh --dry-run        show what would happen, change nothing
#
# The guardrails hook (hooks/pre/kb-guardrails.ts) is installed always, not
# behind a flag. It only inspects `task` calls spawning kb-* agents, so it is
# inert in every session that is not running the board.

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCOPE="user"
DRY=0
UNINSTALL=0
APPLY_CONFIG=0

for arg in "$@"; do
  case "$arg" in
    --project)   SCOPE="project" ;;
    --user)      SCOPE="user" ;;
    --apply-config) APPLY_CONFIG=1 ;;
    --uninstall) UNINSTALL=1 ;;
    --dry-run|-n) DRY=1 ;;
    -h|--help)   sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
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

say()  { printf '%s\n' "$*"; }
run()  { if [ "$DRY" -eq 1 ]; then say "  would: $*"; else "$@"; fi; }

AGENTS=$(cd "$SRC/agents" && ls kb-*.md)
# Every directory under skills/ that holds a SKILL.md — discovered, not hardcoded.
SKILLS=$(cd "$SRC/skills" && for d in */; do [ -f "$d/SKILL.md" ] && printf '%s\n' "${d%/}"; done)
AGENT_COUNT=$(printf '%s\n' "$AGENTS" | grep -c .)
SKILL_COUNT=$(printf '%s\n' "$SKILLS" | grep -c .)

# ---------------------------------------------------------------- uninstall
if [ "$UNINSTALL" -eq 1 ]; then
  say "Uninstalling omp-kanban"
  say ""
  for f in $AGENTS; do
    if [ -e "$AGENT_DIR/$f" ]; then
      run rm -f "$AGENT_DIR/$f"
      say "  removed agents/$f"
    fi
  done
  for s in $SKILLS; do
    if [ -d "$SKILLS_DIR/$s" ]; then
      run rm -rf "$SKILLS_DIR/$s"
      say "  removed skills/$s"
    fi
  done
  for h in kb-guardrails.ts kb-panel.ts; do
    if [ -e "$HOOK_DIR/$h" ]; then
      run rm -f "$HOOK_DIR/$h"
      say "  removed hooks/pre/$h"
    fi
  done
  if [ -e "$ROOT/omp-kanban-guardrails.yml" ]; then
    run rm -f "$ROOT/omp-kanban-guardrails.yml"
    say "  removed omp-kanban-guardrails.yml"
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
  if [ -e "$AGENT_DIR/$f" ] && ! diff -q "$SRC/agents/$f" "$AGENT_DIR/$f" >/dev/null 2>&1; then
    COLLISIONS="$COLLISIONS agents/$f"
  fi
done
for s in $SKILLS; do
  if [ -d "$SKILLS_DIR/$s" ] && ! diff -qr "$SRC/skills/$s" "$SKILLS_DIR/$s" >/dev/null 2>&1; then
    COLLISIONS="$COLLISIONS skills/$s"
  fi
done

if [ -n "$COLLISIONS" ]; then
  say "⚠️  Collision! These files exist and differ from the repo:"
  say "$COLLISIONS"
  say ""
  say "Re-running is safe — each file is compared before copying. If you edited"
  say "any agent or skill locally, back it up first, then re-run to overwrite it."
  say ""
fi

run mkdir -p "$AGENT_DIR" "$SKILLS_DIR" "$HOOK_DIR"

for f in $AGENTS; do
  run cp "$SRC/agents/$f" "$AGENT_DIR/$f"
  say "  agents/$f"
done

for s in $SKILLS; do
  run cp -r "$SRC/skills/$s" "$SKILLS_DIR/"
  say "  skills/$s"
done

# Install dispatch guardrails (gate) and panel auto-launcher hooks
for h in kb-guardrails.ts kb-panel.ts; do
  run cp "$SRC/hooks/pre/$h" "$HOOK_DIR/$h"
  say "  hooks/pre/$h"
done

# The recommended omp settings, as an overlay you can pass per run with
# `omp --config`. --apply-config merges them into config.yml instead.
run cp "$SRC/guardrails/omp-config.recommended.yml" "$ROOT/omp-kanban-guardrails.yml"
say "  omp-kanban-guardrails.yml (overlay; not applied unless you ask)"

# ---------------------------------------------------------- config (opt-in)
# Deliberately opt-in and deliberately non-destructive: these are omp's own
# settings, not this extension's, and silently rewriting a user's config.yml on
# install would be a surprising thing for a plugin to do. Existing values are
# left alone — only keys absent from config.yml are added, so re-running is safe
# and a deliberate override is never clobbered.
if [ "$APPLY_CONFIG" -eq 1 ]; then
  say ""
  say "Merging recommended settings into config.yml (backing it up first)…"
  CONFIG_YML="$ROOT/config.yml"
  if [ ! -f "$CONFIG_YML" ]; then
    say "config.yml does not exist yet. Creating it with recommended settings."
    run cp "$SRC/guardrails/omp-config.recommended.yml" "$CONFIG_YML"
  else
    BACKUP_YML="$CONFIG_YML.omp-kanban-backup.$(date +%s)"
    run cp "$CONFIG_YML" "$BACKUP_YML"
    say "  backed up to $(basename "$BACKUP_YML")"

    # Merge: load both YAMLs, for each key in recommended that's not in config,
    # add it. Simple overlay, no deep merge.
    if command -v python3 >/dev/null 2>&1; then
      export RECOMMENDED_YML="$SRC/guardrails/omp-config.recommended.yml"
      export CONFIG_YML_PATH="$CONFIG_YML"
      python3 << 'PYTHON_MERGE'
import os, yaml

with open(os.environ['RECOMMENDED_YML']) as f:
  recommended = yaml.safe_load(f) or {}

with open(os.environ['CONFIG_YML_PATH']) as f:
  config = yaml.safe_load(f) or {}

for key in recommended:
  if key not in config:
    config[key] = recommended[key]

with open(os.environ['CONFIG_YML_PATH'], 'w') as f:
  yaml.dump(config, f, default_flow_style=False, sort_keys=False)
PYTHON_MERGE
      say "  merged recommended keys into config.yml"
    else
      say "  ⚠️  python3 not found; manual merge needed"
      say "     compare $SRC/guardrails/omp-config.recommended.yml with $CONFIG_YML"
    fi
  fi
fi

say ""
say "Installed $AGENT_COUNT agents and $SKILL_COUNT skills."
say ""
say "Next:"
say "  1. omp -p '/agents'     — confirm the 10 kb-* agents resolved,"
say "                            and that they loaded from $AGENT_DIR."
say "  2. omp -p '/extensions' — confirm the kanban-cycle and cost-forensics skills loaded."
say "  3. Ctrl+R inside /agents reloads from disk after an edit."
say "  4. Add .kanban/ to your .gitignore — cycle artifacts live there."
say ""
if [ "$APPLY_CONFIG" -eq 0 ]; then
  say "Recommended settings (opt-in; not applied yet):"
  say "  ./install.sh --apply-config"
  say "    merges guardrails/omp-config.recommended.yml into config.yml"
fi
say ""
say "Smoke test (cheap, no code written):"
say "  Ask omp: \"use the kanban-cycle skill to plan a fix for <small issue>\""
say "  It should dispatch kb-intake and stop for your confirmation before planning."
