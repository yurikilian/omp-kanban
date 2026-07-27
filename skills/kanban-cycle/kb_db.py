#!/usr/bin/env python3
"""Shared per-run SQLite state for the kanban-cycle board.

Stdlib only. Copied into <run_dir>/kb_db.py at bootstrap; every agent invokes
it as `python3 "$RUN_DIR/kb_db.py" <verb> ...` against the DB living beside it
(`Path(__file__).parent / "kanban.db"` unless --db overrides it for CI).

Verbs: init, load, set, get, packet, sql, selftest, sections, views.
"""
import argparse
import json
import re
import sqlite3
import sys
import time
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parent / "kanban.db"

DDL = """
CREATE TABLE IF NOT EXISTS board (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  run_dir TEXT,
  base_branch TEXT,
  board_column TEXT,
  track TEXT,
  started_at TEXT,
  rework_count INTEGER NOT NULL DEFAULT 0,
  qa_retries INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  kind TEXT NOT NULL,
  body TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  kind TEXT NOT NULL,
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS intake (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  kind TEXT,
  title TEXT,
  summary TEXT,
  risk_level TEXT,
  beneficiary TEXT,
  outcome TEXT,
  signal TEXT,
  smallest_valuable_slice TEXT,
  language TEXT,
  package_manager TEXT,
  test_runner TEXT,
  e2e_framework TEXT
);

CREATE TABLE IF NOT EXISTS intake_suspected_waste (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item TEXT NOT NULL,
  why TEXT,
  recommendation TEXT
);

CREATE TABLE IF NOT EXISTS intake_affected_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  why TEXT,
  confidence TEXT
);

CREATE TABLE IF NOT EXISTS epics (
  epic_id TEXT PRIMARY KEY,
  title TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stories (
  story_id TEXT PRIMARY KEY,
  epic_id TEXT NOT NULL REFERENCES epics(epic_id),
  actor TEXT,
  i_want TEXT,
  so_that TEXT,
  value_rank INTEGER,
  walking_skeleton INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS acceptance_criteria (
  ac_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id),
  ac_given TEXT,
  ac_when TEXT,
  ac_then TEXT
);

CREATE TABLE IF NOT EXISTS story_deps (
  story_id TEXT NOT NULL REFERENCES stories(story_id),
  depends_on TEXT NOT NULL REFERENCES stories(story_id),
  PRIMARY KEY (story_id, depends_on)
);

CREATE TABLE IF NOT EXISTS deferred_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id TEXT REFERENCES stories(story_id),
  decision TEXT NOT NULL,
  decide_by TEXT,
  informed_by TEXT
);

CREATE TABLE IF NOT EXISTS delivery_slices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slice_name TEXT NOT NULL,
  story_id TEXT NOT NULL REFERENCES stories(story_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  story_id TEXT,
  title TEXT,
  intent TEXT,
  layer INTEGER,
  parallel_safe INTEGER NOT NULL DEFAULT 1,
  unsafe_reason TEXT,
  value_rank INTEGER,
  status TEXT NOT NULL DEFAULT 'todo',
  branch TEXT,
  size TEXT,
  complexity TEXT,
  est_files INTEGER,
  validation_cmd TEXT
);

CREATE TABLE IF NOT EXISTS task_deps (
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  depends_on TEXT NOT NULL REFERENCES tasks(task_id),
  PRIMARY KEY (task_id, depends_on)
);

CREATE TABLE IF NOT EXISTS task_files (
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  path TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('claimed', 'changed')),
  shared_surface INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (task_id, path, role)
);

CREATE TABLE IF NOT EXISTS task_ac (
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  ac_id TEXT NOT NULL REFERENCES acceptance_criteria(ac_id),
  PRIMARY KEY (task_id, ac_id)
);

CREATE TABLE IF NOT EXISTS tests (
  test_id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT REFERENCES tasks(task_id),
  name TEXT NOT NULL,
  test_type TEXT,
  file TEXT,
  mocks TEXT,
  planned INTEGER NOT NULL DEFAULT 1,
  UNIQUE (task_id, name)
);

CREATE TABLE IF NOT EXISTS test_ac (
  test_id INTEGER NOT NULL REFERENCES tests(test_id),
  ac_id TEXT NOT NULL REFERENCES acceptance_criteria(ac_id),
  PRIMARY KEY (test_id, ac_id)
);

CREATE TABLE IF NOT EXISTS boundary_violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT REFERENCES tasks(task_id),
  path TEXT NOT NULL,
  needed_for TEXT
);

CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT REFERENCES tasks(task_id),
  chose TEXT,
  over_alt TEXT,
  because TEXT,
  reversible INTEGER
);

CREATE TABLE IF NOT EXISTS defects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT REFERENCES tasks(task_id),
  location TEXT,
  evidence TEXT,
  disposition TEXT NOT NULL DEFAULT 'open'
    CHECK (disposition IN ('open', 'new_task', 'recorded', 'fixed'))
);

CREATE TABLE IF NOT EXISTS suite_runs (
  phase TEXT NOT NULL,
  suite TEXT NOT NULL,
  task_id TEXT NOT NULL DEFAULT '',
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT,
  summary TEXT,
  PRIMARY KEY (phase, suite, task_id, attempt)
);

CREATE TABLE IF NOT EXISTS failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suite TEXT,
  test TEXT,
  error TEXT,
  suspected_task TEXT
);

CREATE TABLE IF NOT EXISTS findings (
  finding_id TEXT PRIMARY KEY,
  author TEXT NOT NULL CHECK (author IN ('reviewer', 'critic')),
  severity TEXT,
  category TEXT,
  location TEXT,
  claim TEXT,
  evidence TEXT,
  suggested_fix TEXT,
  confidence TEXT,
  conceded INTEGER NOT NULL DEFAULT 0,
  ruling TEXT,
  ruling_reason TEXT
);

CREATE TABLE IF NOT EXISTS ac_coverage (
  ac_id TEXT NOT NULL REFERENCES acceptance_criteria(ac_id),
  phase TEXT NOT NULL,
  verdict TEXT,
  covered_by TEXT,
  PRIMARY KEY (ac_id, phase)
);

CREATE TABLE IF NOT EXISTS fixes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  finding_id TEXT REFERENCES findings(finding_id),
  round INTEGER NOT NULL DEFAULT 1,
  change TEXT,
  files TEXT,
  UNIQUE (finding_id, round)
);

CREATE TABLE IF NOT EXISTS fix_ac (
  fix_id INTEGER NOT NULL REFERENCES fixes(id),
  ac_id TEXT NOT NULL REFERENCES acceptance_criteria(ac_id),
  PRIMARY KEY (fix_id, ac_id)
);

CREATE TABLE IF NOT EXISTS verdicts (
  phase TEXT NOT NULL,
  rework_count INTEGER NOT NULL,
  verdict TEXT,
  reviewer_signoff TEXT,
  PRIMARY KEY (phase, rework_count)
);

CREATE TABLE IF NOT EXISTS root_causes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cause TEXT,
  entered_at TEXT,
  prevention TEXT
);

CREATE TABLE IF NOT EXISTS root_cause_findings (
  root_cause_id INTEGER NOT NULL REFERENCES root_causes(id),
  finding_id TEXT NOT NULL REFERENCES findings(finding_id),
  PRIMARY KEY (root_cause_id, finding_id)
);

CREATE TABLE IF NOT EXISTS escapes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  failure TEXT,
  why_not_caught_earlier TEXT,
  missing_layer TEXT,
  prevention TEXT
);

CREATE TABLE IF NOT EXISTS release (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT,
  branch TEXT,
  pr_url TEXT,
  draft INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS release_merges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT REFERENCES tasks(task_id)
);

CREATE TABLE IF NOT EXISTS conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file TEXT,
  task_id TEXT
);
"""

SECTIONS = ["board", "intake", "backlog", "tasks", "progress", "review",
            "critique", "qa", "release", "notes", "events"]
VIEWS = ["board", "intake", "backlog", "acs", "plan-check", "layer", "task",
         "findings", "fixes", "verdict", "qa", "traceability", "flow-metrics",
         "process-notes", "events", "tables"]

# `CREATE TABLE IF NOT EXISTS` silently does nothing to a table that already
# exists, so a kanban.db written before these columns landed would keep loading
# and then fail on the first packet build. Applied on every connect, guarded by
# PRAGMA table_info — adding a column that is already there is a no-op, so this
# is idempotent and safe to re-run.
MIGRATIONS = [
    ("tasks", "size", "TEXT"),
    ("tasks", "complexity", "TEXT"),
    ("tasks", "est_files", "INTEGER"),
    ("tasks", "validation_cmd", "TEXT"),
]

# Thresholds for `get plan-check`'s oversized-task detection. A task past any of
# these is not a task, it is a project: the incident that motivated these had one
# worker change 23 files and add 26 tests inside a single growing session, which
# is unreviewable, undiagnosable when it fails, and expensive to redo.
OVERSIZE = {
    "files_claimed": 8,
    "tests_planned": 8,
    "covers_ac": 5,
}

# Budgets stamped into every task packet. They mirror the omp settings documented
# in docs/CONFIGURATION.md — `task.softRequestBudget` is what actually enforces
# the turn limit (omp force-stops at 1.5x it), and this is the worker-visible
# statement of the same number.
PACKET_BUDGETS = {
    "maxTurns": 40,
    "hardTurns": 60,
    "maxContextTokens": 80000,
    "maxToolOutputChars": 12000,
}

# A packet over this is carrying documents rather than references. The dispatch
# hook rejects assignments past the same ceiling, so keeping them equal means a
# packet that builds here is a packet that dispatches.
PACKET_MAX_CHARS = 20000
PACKET_WARN_CHARS = 12000


class DataError(Exception):
    """A load/set input error naming the offending key or value."""


# --------------------------------------------------------------------- conn

def bootstrap(conn):
    conn.executescript(DDL)
    migrate(conn)


def migrate(conn):
    """Bring a database created by an older copy of this helper up to date."""
    for table, column, coltype in MIGRATIONS:
        existing = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
        if not existing:
            continue  # table not created yet; DDL will include the column
        if column not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}")


def connect(db_path, query_only=False):
    conn = sqlite3.connect(str(db_path), timeout=10, isolation_level=None)
    conn.execute("PRAGMA busy_timeout = 10000")
    conn.execute("PRAGMA foreign_keys = ON")
    if not query_only:
        conn.execute("PRAGMA journal_mode = WAL")
    bootstrap(conn)
    if query_only:
        conn.execute("PRAGMA query_only = ON")
    return conn


def retry_locked(fn, attempts=5):
    delay = 0.05
    for i in range(attempts):
        try:
            return fn()
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower() and i < attempts - 1:
                time.sleep(delay)
                delay *= 2
                continue
            raise


# ------------------------------------------------------------ write helpers

def upsert(conn, table, pk_cols, row):
    cols = list(row.keys())
    placeholders = ",".join("?" for _ in cols)
    updates = ",".join(f"{c}=excluded.{c}" for c in cols if c not in pk_cols)
    sql = f"INSERT INTO {table} ({','.join(cols)}) VALUES ({placeholders})"
    if updates:
        sql += f" ON CONFLICT({','.join(pk_cols)}) DO UPDATE SET {updates}"
    else:
        sql += f" ON CONFLICT({','.join(pk_cols)}) DO NOTHING"
    conn.execute(sql, [row[c] for c in cols])


def insert(conn, table, row):
    cols = list(row.keys())
    conn.execute(
        f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join('?' for _ in cols)})",
        [row[c] for c in cols])
    return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def replace_children(conn, table, parent_col, parent_val, rows, build_row):
    conn.execute(f"DELETE FROM {table} WHERE {parent_col} = ?", (parent_val,))
    for r in rows:
        insert(conn, table, build_row(r))


def as_json(v):
    return json.dumps(v) if v is not None else None


# --------------------------------------------------------- section loaders

def load_board(conn, data, counts):
    if not data:
        return
    row = {"id": 1}
    for k in ("run_dir", "base_branch", "board_column", "track",
              "started_at", "rework_count", "qa_retries"):
        if k in data:
            row[k] = data[k]
    upsert(conn, "board", ["id"], row)
    counts["board"] = counts.get("board", 0) + 1


def load_events(conn, events, counts):
    """Board-side telemetry.

    Deliberately narrow: `kind` plus a JSON body of scalars. Never prompts, never
    tool output, never credentials — this exists so a future incident can be
    diagnosed from counts and transitions, and an event log that carries payloads
    is one that cannot be shared.
    """
    for e in events or []:
        body = e.get("body")
        insert(conn, "events", {
            "kind": e["kind"],
            "body": body if isinstance(body, str) else as_json(body),
        })
        counts["events"] = counts.get("events", 0) + 1


def load_notes(conn, notes, counts):
    for n in notes or []:
        insert(conn, "notes", {"kind": n["kind"], "body": n["body"]})
        counts["notes"] = counts.get("notes", 0) + 1


def load_intake(conn, data, counts):
    if not data:
        return
    risk = data.get("risk", {}) or {}
    vh = data.get("value_hypothesis", {}) or {}
    scope = data.get("scope", {}) or {}
    repo_facts = data.get("repo_facts", {}) or {}
    row = {"id": 1}
    for k, v in {
        "kind": data.get("kind"),
        "title": data.get("title"),
        "summary": data.get("summary"),
        "risk_level": risk.get("level"),
        "beneficiary": vh.get("beneficiary"),
        "outcome": vh.get("outcome"),
        "signal": vh.get("signal"),
        "smallest_valuable_slice": data.get("smallest_valuable_slice"),
        "language": repo_facts.get("language"),
        "package_manager": repo_facts.get("package_manager"),
        "test_runner": repo_facts.get("test_runner"),
        "e2e_framework": repo_facts.get("e2e_framework"),
    }.items():
        if v is not None:
            row[k] = v
    upsert(conn, "intake", ["id"], row)
    counts["intake"] = counts.get("intake", 0) + 1

    for f in risk.get("factors", []) or []:
        insert(conn, "notes", {"kind": "risk_factor", "body": f})
    for q in data.get("open_questions", []) or []:
        insert(conn, "notes", {"kind": "open_question", "body": q})
    for a in scope.get("in", []) or []:
        insert(conn, "notes", {"kind": "scope_in", "body": a})
    for a in scope.get("out", []) or []:
        insert(conn, "notes", {"kind": "scope_out", "body": a})

    waste = data.get("suspected_waste", []) or []
    conn.execute("DELETE FROM intake_suspected_waste")
    for w in waste:
        insert(conn, "intake_suspected_waste", {
            "item": w["item"], "why": w.get("why"),
            "recommendation": w.get("recommendation")})
    counts["intake_suspected_waste"] = len(waste)

    areas = data.get("affected_areas", []) or []
    conn.execute("DELETE FROM intake_affected_areas")
    for a in areas:
        insert(conn, "intake_affected_areas", {
            "path": a["path"], "why": a.get("why"),
            "confidence": a.get("confidence")})
    counts["intake_affected_areas"] = len(areas)


def load_backlog(conn, data, counts):
    if not data:
        return
    epics = data.get("epics", []) or []
    n_epics = n_stories = n_acs = 0
    for e in epics:
        upsert(conn, "epics", ["epic_id"],
               {"epic_id": e["epic_id"], "title": e["title"]})
        n_epics += 1
        for s in e.get("stories", []) or []:
            upsert(conn, "stories", ["story_id"], {
                "story_id": s["story_id"], "epic_id": e["epic_id"],
                "actor": s.get("actor"), "i_want": s.get("i_want"),
                "so_that": s.get("so_that"),
                "value_rank": s.get("value_rank"),
                "walking_skeleton": int(bool(s.get("walking_skeleton", False))),
            })
            n_stories += 1
            for ac in s.get("acceptance_criteria", []) or []:
                upsert(conn, "acceptance_criteria", ["ac_id"], {
                    "ac_id": ac["ac_id"], "story_id": s["story_id"],
                    "ac_given": ac.get("given"), "ac_when": ac.get("when"),
                    "ac_then": ac.get("then"),
                })
                n_acs += 1
            replace_children(
                conn, "story_deps", "story_id", s["story_id"],
                s.get("depends_on", []) or [],
                lambda dep, sid=s["story_id"]: {"story_id": sid, "depends_on": dep})
            replace_children(
                conn, "deferred_decisions", "story_id", s["story_id"],
                s.get("deferred_decisions", []) or [],
                lambda d, sid=s["story_id"]: {
                    "story_id": sid, "decision": d["decision"],
                    "decide_by": d.get("decide_by"),
                    "informed_by": d.get("informed_by")})
    for sl in data.get("delivery_slices", []) or []:
        for sid in sl.get("story_ids", []) or []:
            insert(conn, "delivery_slices",
                   {"slice_name": sl["slice_name"], "story_id": sid})
    counts["epics"] = n_epics
    counts["stories"] = n_stories
    counts["acceptance_criteria"] = n_acs


def load_tasks(conn, data, counts):
    tasks = data or []
    for t in tasks:
        upsert(conn, "tasks", ["task_id"], {
            "task_id": t["task_id"], "story_id": t.get("story_id"),
            "title": t.get("title"), "intent": t.get("intent"),
            "layer": t.get("layer"),
            "parallel_safe": int(bool(t.get("parallel_safe", True))),
            "unsafe_reason": t.get("unsafe_reason"),
            "value_rank": t.get("value_rank"),
            # Absent on a pre-guardrails payload; NULL is a valid "not sized yet"
            # and `get plan-check` derives oversizing from the rows either way.
            "size": t.get("size"),
            "complexity": t.get("complexity"),
            "est_files": t.get("est_files"),
            "validation_cmd": t.get("validation_cmd"),
        })
        replace_children(
            conn, "task_deps", "task_id", t["task_id"],
            t.get("depends_on", []) or [],
            lambda dep, tid=t["task_id"]: {"task_id": tid, "depends_on": dep})
        conn.execute(
            "DELETE FROM task_files WHERE task_id = ? AND role = 'claimed'",
            (t["task_id"],))
        shared = set(t.get("shared_surface", []) or [])
        for p in t.get("files_claimed", []) or []:
            insert(conn, "task_files", {
                "task_id": t["task_id"], "path": p, "role": "claimed",
                "shared_surface": int(p in shared)})
        conn.execute("DELETE FROM task_ac WHERE task_id = ?", (t["task_id"],))
        for ac in t.get("covers_ac", []) or []:
            insert(conn, "task_ac", {"task_id": t["task_id"], "ac_id": ac})
        for test in t.get("tests_planned", []) or []:
            upsert(conn, "tests", ["task_id", "name"], {
                "task_id": t["task_id"], "name": test["name"],
                "test_type": test.get("test_type"), "planned": 1})
            test_id = conn.execute(
                "SELECT test_id FROM tests WHERE task_id = ? AND name = ?",
                (t["task_id"], test["name"])).fetchone()[0]
            for ac in test.get("covers_ac", []) or []:
                upsert(conn, "test_ac", ["test_id", "ac_id"],
                       {"test_id": test_id, "ac_id": ac})
    counts["tasks"] = len(tasks)
    counts["task_files"] = sum(len(t.get("files_claimed", []) or []) for t in tasks)


def load_progress(conn, data, counts):
    entries = data or []
    for p in entries:
        tid = p["task_id"]
        task_row = {"task_id": tid, "status": p["status"]}
        if p.get("branch"):
            task_row["branch"] = p["branch"]
        upsert(conn, "tasks", ["task_id"], task_row)

        conn.execute(
            "DELETE FROM task_files WHERE task_id = ? AND role = 'changed'", (tid,))
        for f in p.get("files_changed", []) or []:
            insert(conn, "task_files",
                   {"task_id": tid, "path": f, "role": "changed"})

        for test in p.get("tests_added", []) or []:
            upsert(conn, "tests", ["task_id", "name"], {
                "task_id": tid, "name": test["name"],
                "test_type": test.get("type"), "file": test.get("file"),
                "planned": 0})
            test_id = conn.execute(
                "SELECT test_id FROM tests WHERE task_id = ? AND name = ?",
                (tid, test["name"])).fetchone()[0]
            for ac in test.get("covers_ac", []) or []:
                upsert(conn, "test_ac", ["test_id", "ac_id"],
                       {"test_id": test_id, "ac_id": ac})

        for bv in p.get("boundary_violations", []) or []:
            insert(conn, "boundary_violations", {
                "task_id": tid, "path": bv["path"],
                "needed_for": bv.get("needed_for")})
        for d in p.get("decisions", []) or []:
            insert(conn, "decisions", {
                "task_id": tid, "chose": d.get("chose"),
                "over_alt": d.get("over"), "because": d.get("because"),
                "reversible": int(bool(d.get("reversible", False)))})
        for defect in p.get("preexisting_defects", []) or []:
            insert(conn, "defects", {
                "task_id": tid, "location": defect["location"],
                "evidence": defect.get("evidence"), "disposition": "open"})
        for s in p.get("surprises", []) or []:
            insert(conn, "notes", {"kind": "surprise", "body": s})
        for g in p.get("known_gaps", []) or []:
            insert(conn, "notes", {"kind": "known_gap", "body": g})

        sr = p.get("suite_result")
        if sr:
            summary = f"{sr.get('passed', 0)} passed, {sr.get('failed', 0)} failed, {sr.get('skipped', 0)} skipped"
            upsert(conn, "suite_runs", ["phase", "suite", "task_id", "attempt"], {
                "phase": "dev", "suite": "full", "task_id": tid, "attempt": 1,
                "status": "pass" if not sr.get("failed") else "fail",
                "summary": summary})
    counts["progress"] = len(entries)


def load_findings(conn, findings, author, counts):
    for f in findings or []:
        row = {
            "finding_id": f.get("finding_id") or f["id"], "author": author,
            "severity": f.get("severity"), "category": f.get("category"),
            "location": f.get("location"), "claim": f.get("claim"),
            "evidence": f.get("evidence"),
            "suggested_fix": f.get("suggested_fix"),
            "confidence": f.get("confidence"),
            "conceded": int(bool(f.get("conceded", False))),
        }
        if "ruling" in f:
            row["ruling"] = f["ruling"]
        if "ruling_reason" in f:
            row["ruling_reason"] = f["ruling_reason"]
        upsert(conn, "findings", ["finding_id"], row)
    counts["findings"] = counts.get("findings", 0) + len(findings or [])


def load_ac_coverage(conn, coverage, phase, counts):
    for c in coverage or []:
        upsert(conn, "ac_coverage", ["ac_id", "phase"], {
            "ac_id": c["ac_id"], "phase": phase, "verdict": c.get("verdict"),
            "covered_by": as_json(c.get("covered_by"))})
    counts["ac_coverage"] = counts.get("ac_coverage", 0) + len(coverage or [])


def load_review(conn, data, counts):
    load_findings(conn, data.get("findings"), "reviewer", counts)
    load_ac_coverage(conn, data.get("ac_coverage"), "reviewer", counts)


def load_critique(conn, data, counts):
    load_findings(conn, data.get("findings"), "critic", counts)
    load_ac_coverage(conn, data.get("ac_coverage"), "critic", counts)

    n_fixes = 0
    for fx in data.get("fixes", []) or []:
        round_ = fx.get("round", 1)
        upsert(conn, "fixes", ["finding_id", "round"], {
            "finding_id": fx["finding_id"], "round": round_,
            "change": fx.get("change"), "files": as_json(fx.get("files"))})
        fix_id = conn.execute(
            "SELECT id FROM fixes WHERE finding_id = ? AND round = ?",
            (fx["finding_id"], round_)).fetchone()[0]
        for ac in fx.get("covers_ac", fx.get("serves_ac", [])) or []:
            upsert(conn, "fix_ac", ["fix_id", "ac_id"],
                   {"fix_id": fix_id, "ac_id": ac})
        n_fixes += 1
    counts["fixes"] = n_fixes

    for rc in data.get("root_causes", []) or []:
        rc_id = insert(conn, "root_causes", {
            "cause": rc["cause"], "entered_at": rc.get("entered_at"),
            "prevention": rc.get("prevention")})
        for fid in rc.get("finding_ids", []) or []:
            insert(conn, "root_cause_findings",
                   {"root_cause_id": rc_id, "finding_id": fid})

    for v in data.get("verdicts", []) or []:
        signoff = v.get("reviewer_signoff")
        if signoff is None:
            prior = conn.execute(
                "SELECT reviewer_signoff FROM verdicts WHERE phase = 'review' "
                "ORDER BY rework_count DESC LIMIT 1").fetchone()
            signoff = prior[0] if prior else None
        upsert(conn, "verdicts", ["phase", "rework_count"], {
            "phase": v.get("phase", "review"),
            "rework_count": v.get("rework_count", 0),
            "verdict": v.get("verdict"), "reviewer_signoff": signoff})

    load_board(conn, data.get("board"), counts)
    load_notes(conn, data.get("notes"), counts)


def load_qa(conn, data, counts):
    n = 0
    for sr in data.get("suite_runs", data.get("results", [])) or []:
        upsert(conn, "suite_runs", ["phase", "suite", "task_id", "attempt"], {
            "phase": "qa", "suite": sr.get("suite"), "task_id": "",
            "attempt": sr.get("attempt", 1), "status": sr.get("status"),
            "summary": sr.get("summary")})
        n += 1
    counts["suite_runs"] = n
    load_ac_coverage(conn, data.get("ac_verification", data.get("ac_coverage")),
                      "qa", counts)
    for f in data.get("failures", []) or []:
        insert(conn, "failures", {
            "suite": f.get("suite"), "test": f.get("test"),
            "error": f.get("error"), "suspected_task": f.get("suspected_task")})
    for e in data.get("escapes", []) or []:
        insert(conn, "escapes", {
            "failure": e.get("failure"),
            "why_not_caught_earlier": e.get("why_not_caught_earlier"),
            "missing_layer": e.get("missing_layer"),
            "prevention": e.get("prevention")})
    for t in data.get("tests", []) or []:
        upsert(conn, "tests", ["task_id", "name"], {
            "task_id": t.get("task_id", ""), "name": t["name"],
            "test_type": t.get("test_type", "e2e"), "file": t.get("file"),
            "planned": 0})
    for fl in data.get("flaky", []) or []:
        insert(conn, "notes", {"kind": "flaky", "body": fl})
    load_board(conn, data.get("board"), counts)
    load_notes(conn, data.get("notes"), counts)


def load_release(conn, data, counts):
    rel = data.get("release")
    if rel:
        row = {"id": 1}
        for k in ("status", "branch", "pr_url", "draft"):
            if k in rel:
                row[k] = int(rel[k]) if k == "draft" else rel[k]
        upsert(conn, "release", ["id"], row)
        counts["release"] = 1
    for m in data.get("release_merges", []) or []:
        insert(conn, "release_merges", {"task_id": m["task_id"] if isinstance(m, dict) else m})
    for c in data.get("conflicts", []) or []:
        insert(conn, "conflicts", {"file": c["file"], "task_id": ",".join(c.get("tasks", []))
                                    if isinstance(c.get("tasks"), list) else c.get("task_id")})
    for sr in data.get("suite_runs", []) or []:
        upsert(conn, "suite_runs", ["phase", "suite", "task_id", "attempt"], {
            "phase": "release", "suite": sr.get("suite"), "task_id": "",
            "attempt": sr.get("attempt", 1), "status": sr.get("status"),
            "summary": sr.get("summary")})
    load_board(conn, data.get("board"), counts)


SECTION_LOADERS = {
    "board": load_board,
    "intake": load_intake,
    "backlog": load_backlog,
    "tasks": load_tasks,
    "progress": load_progress,
    "review": load_review,
    "critique": load_critique,
    "qa": load_qa,
    "release": load_release,
    "notes": load_notes,
    "events": load_events,
}


def cmd_load(args):
    payload_text = Path(args.file).read_text() if args.file else sys.stdin.read()
    try:
        payload = json.loads(payload_text)
    except json.JSONDecodeError as e:
        print(f"error: invalid JSON on stdin: {e}", file=sys.stderr)
        return 2
    unknown = set(payload) - set(SECTIONS)
    if unknown:
        print(f"error: unknown section(s) {sorted(unknown)}; known: {SECTIONS}",
              file=sys.stderr)
        return 1

    conn = connect(args.db)
    counts = {}
    try:
        conn.execute("BEGIN")
        for section, data in payload.items():
            SECTION_LOADERS[section](conn, data, counts)
        if args.dry_run:
            conn.execute("ROLLBACK")
        else:
            conn.execute("COMMIT")
    except (sqlite3.IntegrityError, sqlite3.OperationalError, KeyError) as e:
        conn.execute("ROLLBACK")
        print(f"error: {type(e).__name__}: {e}", file=sys.stderr)
        return 1
    finally:
        conn.close()
    print(json.dumps({"ok": True, "wrote": counts}))
    return 0


# ------------------------------------------------------------------- set

ENTITY_TABLES = {
    "board": ("board", ["id"], {"id": 1}),
    "task": ("tasks", ["task_id"], None),
    "finding": ("findings", ["finding_id"], None),
    "story": ("stories", ["story_id"], None),
    "defect": ("defects", ["id"], None),
}


def cmd_set(args):
    if not args.rest:
        print("usage: set <entity> [<id>] k=v [k=v ...]", file=sys.stderr)
        return 2
    entity = args.rest[0]
    if entity not in ENTITY_TABLES:
        print(f"error: unknown entity '{entity}'; known: {sorted(ENTITY_TABLES)}",
              file=sys.stderr)
        return 1
    table, pk_cols, fixed_pk = ENTITY_TABLES[entity]
    rest = args.rest[1:]
    if fixed_pk is None:
        if not rest or "=" in rest[0]:
            print(f"error: '{entity}' requires an id as the second argument",
                  file=sys.stderr)
            return 2
        pk_val = rest[0]
        rest = rest[1:]
        row = {pk_cols[0]: pk_val}
    else:
        row = dict(fixed_pk)
    for kv in rest:
        if "=" not in kv:
            print(f"error: expected k=v, got '{kv}'", file=sys.stderr)
            return 2
        k, v = kv.split("=", 1)
        row[k] = v

    conn = connect(args.db)
    try:
        conn.execute("BEGIN")
        upsert(conn, table, pk_cols, row)
        conn.execute("COMMIT")
    except (sqlite3.IntegrityError, sqlite3.OperationalError) as e:
        conn.execute("ROLLBACK")
        print(f"error: {type(e).__name__}: {e}", file=sys.stderr)
        return 1
    finally:
        conn.close()
    print(json.dumps({"ok": True}))
    return 0


# ------------------------------------------------------------------- get

def rows_to_dicts(cur):
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def print_rows(rows, fmt):
    if fmt == "json":
        print(json.dumps(rows, indent=2))
        return
    if not rows:
        print("(empty)")
        return
    cols = list(rows[0].keys())
    if fmt == "md":
        print("| " + " | ".join(cols) + " |")
        print("|" + "|".join("---" for _ in cols) + "|")
        for r in rows:
            print("| " + " | ".join(str(r[c]) if r[c] is not None else "" for c in cols) + " |")
        return
    print("\t".join(cols))
    for r in rows:
        print("\t".join(str(r[c]) if r[c] is not None else "" for c in cols))


def view_plan_check(conn):
    layer_dep = rows_to_dicts(conn.execute("""
        SELECT td.task_id, td.depends_on
          FROM task_deps td
          JOIN tasks a ON a.task_id = td.task_id
          JOIN tasks b ON b.task_id = td.depends_on
         WHERE a.layer <= b.layer
    """))
    parallel_conflicts = rows_to_dicts(conn.execute("""
        SELECT a.task_id AS task_a, b.task_id AS task_b, a.path
          FROM task_files a JOIN task_files b
            ON a.path = b.path AND a.task_id < b.task_id
          JOIN tasks ta ON ta.task_id = a.task_id
          JOIN tasks tb ON tb.task_id = b.task_id
         WHERE a.role = 'claimed' AND b.role = 'claimed'
           AND ta.layer = tb.layer
           AND ta.parallel_safe = 1 AND tb.parallel_safe = 1
    """))
    return {"layer_dep_violations": layer_dep,
            "parallel_file_conflicts": parallel_conflicts,
            "oversized_tasks": view_oversized(conn)}


def view_oversized(conn):
    """Tasks too large to finish inside one bounded session.

    Every signal is derived from rows the decomposer already wrote, so this adds
    no bookkeeping for an agent to get wrong. A task that trips any of them has
    more than one independently testable outcome, needs discovery and
    implementation in the same worker, or spans unrelated subsystems — the shape
    that produced 100-plus model rounds in a single growing session.

    `size: large` is honoured as a self-report: a decomposer that knows a task is
    large should not need the file count to prove it.
    """
    rows = rows_to_dicts(conn.execute("""
        SELECT t.task_id, t.size, t.est_files,
               (SELECT COUNT(*) FROM task_files f
                 WHERE f.task_id = t.task_id AND f.role = 'claimed') AS files_claimed,
               (SELECT COUNT(*) FROM tests s
                 WHERE s.task_id = t.task_id AND s.planned = 1)      AS tests_planned,
               (SELECT COUNT(*) FROM task_ac a
                 WHERE a.task_id = t.task_id)                        AS covers_ac,
               (SELECT COUNT(DISTINCT s2.story_id) FROM task_ac a2
                  JOIN acceptance_criteria ac ON ac.ac_id = a2.ac_id
                  JOIN stories s2 ON s2.story_id = ac.story_id
                 WHERE a2.task_id = t.task_id)                       AS stories_spanned
          FROM tasks t
         ORDER BY t.task_id
    """))
    flagged = []
    for r in rows:
        reasons = []
        for key, limit in OVERSIZE.items():
            if (r.get(key) or 0) > limit:
                reasons.append(f"{key}={r[key]} exceeds {limit}")
        if (r.get("est_files") or 0) > OVERSIZE["files_claimed"]:
            reasons.append(f"est_files={r['est_files']} exceeds "
                            f"{OVERSIZE['files_claimed']}")
        if (r.get("stories_spanned") or 0) > 1:
            reasons.append(f"spans {r['stories_spanned']} stories")
        if r.get("size") == "large":
            reasons.append("declared size=large")
        if reasons:
            flagged.append({"task_id": r["task_id"], "reasons": reasons})
    return flagged


def dedup_key(finding):
    """Stable identity for a finding across two independent reviewers.

    `location` is free text like `src/a.ts:41`. Bucketing the line by ten keeps
    two reviewers who point at the same defect a few lines apart from being
    counted twice, without merging genuinely separate findings in one file.
    """
    loc = (finding.get("location") or "").strip()
    m = re.match(r"^(.*?):(\d+)", loc)
    if m:
        path, line = m.group(1), int(m.group(2)) // 10
    else:
        path, line = loc, -1
    return (path, line, (finding.get("category") or "").lower())


SEVERITY_ORDER = {"critical": 0, "major": 1, "high": 1, "medium": 2,
                  "minor": 3, "low": 3, "nit": 4}


def view_findings_merged(conn):
    """Deterministic dedup, run before consolidation.

    The reviewer's row wins the id because it was written first and the critic's
    rulings reference it; the critic's evidence is preserved alongside rather than
    discarded, since agreement between two independent reviewers is exactly the
    signal the consolidator needs to prioritise. Ordering is total, so two runs
    over the same database produce byte-identical output.
    """
    rows = rows_to_dicts(conn.execute(
        "SELECT * FROM findings ORDER BY CASE author WHEN 'reviewer' THEN 0 ELSE 1 END, "
        "finding_id"))
    merged = {}
    for r in rows:
        key = dedup_key(r)
        if key in merged:
            first = merged[key]
            first["authors"] = sorted(set(first["authors"].split(",")) | {r["author"]})
            first["authors"] = ",".join(first["authors"])
            first["corroborating_ids"] = ",".join(
                filter(None, [first.get("corroborating_ids"), r["finding_id"]]))
            if SEVERITY_ORDER.get((r.get("severity") or "").lower(), 9) < \
               SEVERITY_ORDER.get((first.get("severity") or "").lower(), 9):
                first["severity"] = r["severity"]
            continue
        row = dict(r)
        row["authors"] = r["author"]
        row["corroborating_ids"] = ""
        merged[key] = row
    out = list(merged.values())
    out.sort(key=lambda r: (SEVERITY_ORDER.get((r.get("severity") or "").lower(), 9),
                            r["finding_id"]))
    return out


def critic_has_recorded(conn):
    return conn.execute(
        "SELECT COUNT(*) FROM findings WHERE author = 'critic'").fetchone()[0] > 0


def view_task(conn, task_id):
    task = rows_to_dicts(conn.execute(
        "SELECT * FROM tasks WHERE task_id = ?", (task_id,)))
    if not task:
        return None
    result = task[0]
    result["files"] = rows_to_dicts(conn.execute(
        "SELECT path, role, shared_surface FROM task_files WHERE task_id = ?",
        (task_id,)))
    result["depends_on"] = [r["depends_on"] for r in rows_to_dicts(conn.execute(
        "SELECT depends_on FROM task_deps WHERE task_id = ?", (task_id,)))]
    result["covers_ac"] = [r["ac_id"] for r in rows_to_dicts(conn.execute(
        "SELECT ac_id FROM task_ac WHERE task_id = ?", (task_id,)))]
    result["tests"] = rows_to_dicts(conn.execute(
        "SELECT name, test_type, file, planned FROM tests WHERE task_id = ?",
        (task_id,)))
    return result


def view_traceability_md(conn):
    rows = rows_to_dicts(conn.execute("""
        SELECT ac.ac_id, ac.ac_then AS description,
               GROUP_CONCAT(DISTINCT t.name) AS covered_by,
               MAX(COALESCE(cov.verdict, 'uncovered')) AS status
          FROM acceptance_criteria ac
          LEFT JOIN test_ac ta ON ta.ac_id = ac.ac_id
          LEFT JOIN tests t ON t.test_id = ta.test_id
          LEFT JOIN ac_coverage cov ON cov.ac_id = ac.ac_id
         GROUP BY ac.ac_id
         ORDER BY ac.ac_id
    """))
    lines = ["| AC | Description | Covered by | Status |", "|----|-------------|------------|--------|"]
    for r in rows:
        lines.append(f"| {r['ac_id']} | {r['description'] or ''} | "
                      f"{r['covered_by'] or ''} | {r['status']} |")
    return "\n".join(lines)


def view_flow_metrics(conn):
    tasks_completed = conn.execute(
        "SELECT COUNT(*) FROM tasks WHERE status = 'done'").fetchone()[0]
    tasks_reworked = conn.execute(
        "SELECT COUNT(DISTINCT fx.finding_id) FROM fixes fx "
        "JOIN findings f ON f.finding_id = fx.finding_id").fetchone()[0]
    rework_loops = conn.execute(
        "SELECT COALESCE(MAX(rework_count), 0) FROM verdicts").fetchone()[0]
    defects_by_column = rows_to_dicts(conn.execute(
        "SELECT entered_at AS board_column, COUNT(*) AS count "
        "FROM root_causes GROUP BY entered_at"))
    return {
        "tasks_completed": tasks_completed,
        "tasks_reworked": tasks_reworked,
        "rework_loops": rework_loops,
        "defects_by_column": defects_by_column,
    }


def view_process_notes(conn):
    root_causes = rows_to_dicts(conn.execute(
        "SELECT cause, entered_at, prevention FROM root_causes"))
    escapes = rows_to_dicts(conn.execute(
        "SELECT failure, why_not_caught_earlier, missing_layer, prevention FROM escapes"))
    carried = rows_to_dicts(conn.execute(
        "SELECT body FROM notes WHERE kind = 'carried_nit'"))
    return {"root_causes": root_causes, "escapes": escapes, "carried_nits": carried}


def cmd_get(args):
    if not args.rest:
        print("usage: get <view> [flags]", file=sys.stderr)
        return 2
    view = args.rest[0]
    rest = args.rest[1:]
    flags = {}
    i = 0
    while i < len(rest):
        if rest[i].startswith("--"):
            key = rest[i][2:]
            if i + 1 < len(rest) and not rest[i + 1].startswith("--"):
                flags[key] = rest[i + 1]
                i += 2
            else:
                flags[key] = True
                i += 1
        else:
            i += 1
    fmt = flags.get("format", "tsv")

    conn = connect(args.db, query_only=True)
    try:
        if view == "board":
            print_rows(rows_to_dicts(conn.execute("SELECT * FROM board")), fmt)
        elif view == "intake":
            print_rows(rows_to_dicts(conn.execute("SELECT * FROM intake")), fmt)
        elif view == "backlog":
            print_rows(rows_to_dicts(conn.execute("""
                SELECT e.epic_id, e.title AS epic_title, s.story_id, s.actor,
                       s.i_want, s.value_rank, s.walking_skeleton
                  FROM epics e JOIN stories s ON s.epic_id = e.epic_id
                 ORDER BY e.epic_id, s.value_rank
            """)), fmt)
        elif view == "acs":
            print_rows(rows_to_dicts(conn.execute(
                "SELECT * FROM acceptance_criteria ORDER BY ac_id")), fmt)
        elif view == "plan-check":
            print(json.dumps(view_plan_check(conn)))
        elif view == "layer":
            n = flags.get("n")
            if n is None:
                print("error: get layer requires --n N", file=sys.stderr)
                return 2
            print_rows(rows_to_dicts(conn.execute(
                "SELECT task_id, parallel_safe FROM tasks WHERE layer = ? "
                "ORDER BY parallel_safe DESC", (n,))), fmt)
        elif view == "task":
            tid = flags.get("id")
            if not tid:
                print("error: get task requires --id T1", file=sys.stderr)
                return 2
            result = view_task(conn, tid)
            if result is None:
                print(f"error: no such task '{tid}'", file=sys.stderr)
                return 1
            print(json.dumps(result, indent=2))
        elif view == "findings":
            # Independence gate. The critic must record its own pass before it can
            # read the reviewer's, so "form a view of your own first" is a property
            # of the query rather than an instruction the model may skip under
            # pressure — the same argument that scopes `get task` to one task.
            # Reading merged findings implies consolidation, which is downstream of
            # both passes, so it is gated identically.
            wants_reviewer = flags.get("author") == "reviewer" or "merged" in flags
            if wants_reviewer and not critic_has_recorded(conn):
                print("error: no findings recorded with author='critic' yet. Form "
                      "your own independent view and `load` it under the `critique` "
                      "section before reading the reviewer's findings — reading "
                      "them first anchors your review to theirs, which is the one "
                      "thing two reviewers exist to avoid.", file=sys.stderr)
                return 1
            if "merged" in flags:
                print(json.dumps(view_findings_merged(conn), indent=2))
            else:
                sql = "SELECT * FROM findings WHERE 1=1"
                params = []
                if flags.get("author"):
                    sql += " AND author = ?"
                    params.append(flags["author"])
                if "open" in flags:
                    sql += " AND conceded = 0"
                print_rows(rows_to_dicts(conn.execute(sql, params)), fmt)
        elif view == "events":
            sql = "SELECT id, ts, kind, body FROM events"
            params = []
            if flags.get("kind"):
                sql += " WHERE kind = ?"
                params.append(flags["kind"])
            sql += " ORDER BY id"
            print_rows(rows_to_dicts(conn.execute(sql, params)), fmt)
        elif view == "fixes":
            print_rows(rows_to_dicts(conn.execute("""
                SELECT fx.id, fx.finding_id, fx.round, fx.change, fx.files,
                       GROUP_CONCAT(fa.ac_id) AS covers_ac
                  FROM fixes fx LEFT JOIN fix_ac fa ON fa.fix_id = fx.id
                 GROUP BY fx.id
            """)), fmt)
        elif view == "verdict":
            print_rows(rows_to_dicts(conn.execute(
                "SELECT * FROM verdicts ORDER BY phase, rework_count DESC")), fmt)
        elif view == "qa":
            print_rows(rows_to_dicts(conn.execute(
                "SELECT * FROM suite_runs WHERE phase = 'qa'")), fmt)
        elif view == "traceability":
            if fmt == "md" or flags.get("format") == "md":
                print(view_traceability_md(conn))
            else:
                print(view_traceability_md(conn))
        elif view == "flow-metrics":
            print(json.dumps(view_flow_metrics(conn)))
        elif view == "process-notes":
            print(json.dumps(view_process_notes(conn)))
        elif view == "tables":
            print_rows(rows_to_dicts(conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")), fmt)
        else:
            print(f"error: unknown view '{view}'; known: {VIEWS}", file=sys.stderr)
            return 2
    finally:
        conn.close()
    return 0


# ---------------------------------------------------------------- packet

def build_packet(conn, task_id):
    """The whole assignment a worker needs, and nothing else.

    What this deliberately does NOT contain: the full acceptance-criteria table
    (only the ACs this task covers, joined through `task_ac`), the workflow
    documentation, the backlog, sibling tasks, or file contents. Candidate files
    are paths — the worker reads the ranges it needs, which costs far less than
    shipping every file to every worker and is the only version that stays
    bounded as the board grows.

    Repeated context is deduplicated by construction: each list is a set of rows
    from one query, so a file claimed twice or an AC covered twice appears once.
    """
    task = rows_to_dicts(conn.execute(
        "SELECT task_id, title, intent, layer, parallel_safe, unsafe_reason, "
        "size, complexity, est_files, validation_cmd, story_id, status, branch "
        "FROM tasks WHERE task_id = ?", (task_id,)))
    if not task:
        return None
    t = task[0]

    acs = rows_to_dicts(conn.execute("""
        SELECT ac.ac_id, ac.ac_given, ac.ac_when, ac.ac_then
          FROM task_ac ta JOIN acceptance_criteria ac ON ac.ac_id = ta.ac_id
         WHERE ta.task_id = ?
         ORDER BY ac.ac_id
    """, (task_id,)))
    files = [r["path"] for r in rows_to_dicts(conn.execute(
        "SELECT DISTINCT path FROM task_files WHERE task_id = ? AND role = 'claimed' "
        "ORDER BY path", (task_id,)))]
    shared = [r["path"] for r in rows_to_dicts(conn.execute(
        "SELECT DISTINCT path FROM task_files WHERE task_id = ? AND role = 'claimed' "
        "AND shared_surface = 1 ORDER BY path", (task_id,)))]
    deps = [r["depends_on"] for r in rows_to_dicts(conn.execute(
        "SELECT depends_on FROM task_deps WHERE task_id = ? ORDER BY depends_on",
        (task_id,)))]
    tests = rows_to_dicts(conn.execute(
        "SELECT name, test_type FROM tests WHERE task_id = ? AND planned = 1 "
        "ORDER BY name", (task_id,)))

    constraints = ["Create or modify only the files under candidateFiles; record "
                   "anything else in boundary_violations rather than editing it."]
    if shared:
        constraints.append("Shared surface — a change here collides at merge no "
                           f"matter how isolated the worktree: {', '.join(shared)}")
    if not t["parallel_safe"]:
        constraints.append("Not parallel-safe" +
                           (f": {t['unsafe_reason']}" if t["unsafe_reason"] else ""))

    return {
        "task": {
            "id": t["task_id"],
            "title": t["title"],
            "objective": t["intent"],
            "size": t["size"],
            "complexity": t["complexity"],
            "acceptanceCriteria": [
                {"id": a["ac_id"], "given": a["ac_given"],
                 "when": a["ac_when"], "then": a["ac_then"]} for a in acs],
            "candidateFiles": files,
            "dependencies": deps,
            "constraints": constraints,
            "validation": {
                "commands": [t["validation_cmd"]] if t["validation_cmd"] else [],
                "expectedResults": [f"{x['name']} ({x['test_type']}) passes"
                                     for x in tests],
            },
            "budgets": dict(PACKET_BUDGETS),
        }
    }


def cmd_packet(args):
    conn = connect(args.db, query_only=True)
    try:
        packet = build_packet(conn, args.task_id)
    finally:
        conn.close()
    if packet is None:
        print(f"error: no such task '{args.task_id}'", file=sys.stderr)
        return 1

    text = json.dumps(packet, indent=2)
    size = len(text)
    packet["meta"] = {"sizeChars": size, "maxChars": args.max_chars,
                       "warnChars": PACKET_WARN_CHARS}
    text = json.dumps(packet, indent=2)

    if size > args.max_chars:
        msg = (f"error: task packet for {args.task_id} is {size} chars, over the "
               f"{args.max_chars} limit. Something document-shaped is in the "
               f"database — trim intent, acceptance criteria, or claimed files, or "
               f"split the task. Re-run with --warn-only to emit it anyway.")
        if not args.warn_only:
            print(msg, file=sys.stderr)
            return 1
        print(f"warning: {msg}", file=sys.stderr)
    elif size > PACKET_WARN_CHARS:
        print(f"warning: task packet for {args.task_id} is {size} chars "
              f"(warn threshold {PACKET_WARN_CHARS})", file=sys.stderr)
    print(text)
    return 0


# ------------------------------------------------------------------- sql

def cmd_sql(args):
    stmt = args.stmt.strip()
    if not re_match_select(stmt):
        print("error: sql only accepts a single SELECT/WITH statement",
              file=sys.stderr)
        return 2
    conn = connect(args.db, query_only=True)
    try:
        cur = conn.execute(stmt)
        print_rows(rows_to_dicts(cur), args.format)
    except sqlite3.Error as e:
        print(f"error: {type(e).__name__}: {e}", file=sys.stderr)
        return 1
    finally:
        conn.close()
    return 0


def re_match_select(stmt):
    head = stmt.lstrip().upper()
    if ";" in stmt.rstrip(";"):
        return False
    return head.startswith("SELECT") or head.startswith("WITH")


# --------------------------------------------------------------------- init

def cmd_init(args):
    conn = connect(args.db)
    try:
        conn.execute("BEGIN")
        conn.execute("""
            INSERT INTO board (id, run_dir, base_branch, board_column, track,
                                started_at, rework_count, qa_retries)
            VALUES (1, ?, ?, 'intake', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'), 0, 0)
            ON CONFLICT(id) DO UPDATE SET run_dir = excluded.run_dir,
                                           base_branch = excluded.base_branch
        """, (args.run_dir, args.base_branch))
        conn.execute("COMMIT")
    except sqlite3.Error as e:
        conn.execute("ROLLBACK")
        print(f"error: {type(e).__name__}: {e}", file=sys.stderr)
        return 1
    finally:
        conn.close()
    print(json.dumps({"ok": True}))
    return 0


# ---------------------------------------------------------------- selftest

def cmd_selftest(args):
    db = args.db
    conn = connect(db)
    conn.close()

    def run(*argv):
        rc = main(list(argv) + ["--db", str(db)])
        assert rc == 0, f"command failed: {argv}"

    run("init", "--run-dir", "/tmp/selftest", "--base-branch", "main")

    def load(payload):
        import io
        old_stdin = sys.stdin
        sys.stdin = io.StringIO(json.dumps(payload))
        try:
            rc = main(["load", "--db", str(db)])
        finally:
            sys.stdin = old_stdin
        assert rc == 0, f"load failed for {payload}"

    load({"intake": {
        "kind": "issue", "title": "t", "summary": "s",
        "risk": {"level": "low", "factors": ["f1"]},
        "value_hypothesis": {"beneficiary": "b", "outcome": "o", "signal": "s"},
        "smallest_valuable_slice": "slice", "open_questions": ["q1"],
        "suspected_waste": [{"item": "x", "why": "y", "recommendation": "z"}],
        "affected_areas": [{"path": "src/a.ts", "why": "y", "confidence": "high"}],
    }})
    load({"backlog": {"epics": [{"epic_id": "E1", "title": "Epic", "stories": [
        {"story_id": "E1-S1", "actor": "user", "i_want": "x", "so_that": "y",
         "value_rank": 1,
         "acceptance_criteria": [{"ac_id": "E1-S1-AC1", "given": "g",
                                   "when": "w", "then": "t"}]}
    ]}]}})
    load({"tasks": [{"task_id": "T1", "story_id": "E1-S1", "title": "Do x",
                     "intent": "i", "layer": 0, "parallel_safe": True,
                     "size": "small", "complexity": "low", "est_files": 1,
                     "validation_cmd": "npm test -- src/a.test.ts",
                     "covers_ac": ["E1-S1-AC1"], "depends_on": [],
                     "files_claimed": ["src/a.ts"],
                     "tests_planned": [{"name": "unit test", "test_type": "unit",
                                        "covers_ac": ["E1-S1-AC1"]}]}]})
    load({"progress": [{"task_id": "T1", "status": "done",
                        "files_changed": ["src/a.ts"],
                        "tests_added": [{"name": "unit test", "type": "unit",
                                         "file": "src/a.test.ts",
                                         "covers_ac": ["E1-S1-AC1"]}]}]})
    load({"review": {"findings": [{"id": "F1", "severity": "minor",
                                    "category": "convention", "location": "src/a.ts:1",
                                    "claim": "c", "evidence": "e"}],
                     "ac_coverage": [{"ac_id": "E1-S1-AC1", "verdict": "covered",
                                      "covered_by": ["unit test"]}]}})
    load({"critique": {"verdicts": [{"rework_count": 0, "verdict": "approved",
                                     "reviewer_signoff": "confirmed"}],
                       "findings": [{"id": "C1", "severity": "major",
                                      "category": "correctness",
                                      "location": "src/a.ts:3", "claim": "c",
                                      "evidence": "e"}]}})
    load({"events": [{"kind": "dispatch", "body": {"width": 2}}]})
    load({"qa": {"suite_runs": [{"suite": "unit", "status": "pass", "summary": "1 passed"}]}})
    load({"release": {"release": {"status": "pr_opened", "branch": "feature/x"}}})

    for view, extra in [("board", []), ("intake", []), ("backlog", []),
                         ("acs", []), ("plan-check", []), ("layer", ["--n", "0"]),
                         ("task", ["--id", "T1"]), ("findings", []),
                         ("findings", ["--merged"]), ("findings", ["--author", "reviewer"]),
                         ("fixes", []), ("verdict", []), ("qa", []), ("traceability", []),
                         ("flow-metrics", []), ("process-notes", []), ("events", []),
                         ("tables", [])]:
        rc = main(["get", view] + extra + ["--db", str(db)])
        assert rc == 0, f"get {view} {extra} failed"

    rc = main(["packet", "--task-id", "T1", "--db", str(db)])
    assert rc == 0, "packet T1 failed"

    print("selftest: all sections, views, and packet build OK")
    return 0


# --------------------------------------------------------------------- cli

def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if not argv:
        print(__doc__, file=sys.stderr)
        return 2
    verb, rest = argv[0], argv[1:]

    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--db", default=str(DEFAULT_DB))

    if verb == "init":
        parser.add_argument("--run-dir", dest="run_dir", required=True)
        parser.add_argument("--base-branch", dest="base_branch", required=True)
        args = parser.parse_args(rest)
        return cmd_init(args)
    if verb == "load":
        parser.add_argument("--file")
        parser.add_argument("--dry-run", action="store_true")
        args = parser.parse_args(rest)
        return cmd_load(args)
    if verb == "set":
        args, unknown = parser.parse_known_args(rest)
        args.rest = unknown
        return cmd_set(args)
    if verb == "get":
        args, unknown = parser.parse_known_args(rest)
        args.rest = unknown
        return cmd_get(args)
    if verb == "packet":
        parser.add_argument("--task-id", dest="task_id", required=True)
        parser.add_argument("--max-chars", dest="max_chars", type=int,
                            default=PACKET_MAX_CHARS)
        parser.add_argument("--warn-only", dest="warn_only", action="store_true")
        args = parser.parse_args(rest)
        return cmd_packet(args)
    if verb == "sql":
        parser.add_argument("stmt")
        parser.add_argument("--format", default="tsv")
        args = parser.parse_args(rest)
        return cmd_sql(args)
    if verb == "selftest":
        args = parser.parse_args(rest)
        args.db = args.db if args.db != str(DEFAULT_DB) else str(Path(args.db).parent / "selftest.db")
        return cmd_selftest(args)
    if verb == "sections":
        print(json.dumps(SECTIONS))
        return 0
    if verb == "views":
        print(json.dumps(VIEWS))
        return 0

    print(f"error: unknown verb '{verb}'", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
