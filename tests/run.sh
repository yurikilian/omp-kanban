#!/usr/bin/env bash
# Run every test in the repo core.
#
#   ./tests/run.sh
#
# Two runners because there are two languages and neither needs a dependency:
# the run-state helper is stdlib Python, the dispatch hook is TypeScript that
# Node runs directly via type stripping (Node 22.6+).
#
# The vendored panel has its own vitest and Playwright suites and is not
# covered here — it is optional, opt-in, and unrelated to the board.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

status=0

echo "== validate.py =="
./validate.py -q || status=1

echo
echo "== kb_db.py (python unittest) =="
python3 -m unittest discover -s tests -p "test_*.py" || status=1

echo
echo "== kb-guardrails.ts (node --test) =="
if ! command -v node >/dev/null 2>&1; then
  echo "node not found — skipping the guardrail hook tests" >&2
  status=1
else
  # Named explicitly: `--test <dir>` also picks up the Python tests and the
  # shell runner and then fails trying to load them as modules.
  node --test tests/*.test.ts || status=1
fi

echo
if [ "$status" -eq 0 ]; then
  echo "all suites passed"
else
  echo "FAILURES — see above" >&2
fi
exit "$status"
