#!/usr/bin/env bash
# omp-kanban uninstaller
#
# Removes the agents, skill, and (if present) the panel hook + vendored app
# that install.sh copied into an omp discovery root.
#
#   ./uninstall.sh              remove from the user root (~/.omp/agent)
#   ./uninstall.sh --project    remove from ./.omp for this repo only
#   ./uninstall.sh --dry-run    show what would be removed, change nothing
#
# Combine flags freely, e.g. ./uninstall.sh --project --dry-run
#
# This is a thin wrapper over `install.sh --uninstall`: the removal logic lives
# in exactly one place so the two scripts cannot drift apart (see CLAUDE.md).
# The panel's runtime state (~/.omp/agent/panel/, holding state.json and the
# lock directory) is intentionally left in place — remove it by hand if you
# want it gone.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for arg in "$@"; do
  case "$arg" in
    -h|--help) sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
  esac
done

exec "$DIR/install.sh" --uninstall "$@"
