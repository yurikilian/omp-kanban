#!/usr/bin/env python3
"""Tests for the board's run-state helper.

Everything goes through the CLI rather than importing the functions, because the
CLI is what the agents actually call — an agent invokes
`python3 "$RUN_DIR/kb_db.py" get ...` and reads stdout and the exit code. A test
that bypassed it would pass while the contract the prompts depend on was broken.

    python3 -m unittest discover -s tests -v
"""
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KB_DB = ROOT / "skills" / "kanban-cycle" / "kb_db.py"


class KbDbCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.db = Path(self._tmp.name) / "kanban.db"
        self.addCleanup(self._tmp.cleanup)
        self.kb_ok("init", "--run-dir", self._tmp.name, "--base-branch", "main")

    # ------------------------------------------------------------- helpers

    def kb(self, *argv, stdin=None):
        return subprocess.run(
            [sys.executable, str(KB_DB), *argv, "--db", str(self.db)],
            input=stdin, capture_output=True, text=True, timeout=30)

    def kb_ok(self, *argv, stdin=None):
        proc = self.kb(*argv, stdin=stdin)
        self.assertEqual(proc.returncode, 0,
                         f"{argv} failed: {proc.stderr or proc.stdout}")
        return proc

    def load(self, payload):
        return self.kb_ok("load", stdin=json.dumps(payload))

    def seed_backlog(self, n_acs=2):
        acs = [{"ac_id": f"E1-S1-AC{i}", "given": "g", "when": "w", "then": f"t{i}"}
               for i in range(1, n_acs + 1)]
        self.load({"backlog": {"epics": [{
            "epic_id": "E1", "title": "Epic",
            "stories": [{"story_id": "E1-S1", "actor": "user", "i_want": "x",
                         "so_that": "y", "value_rank": 1,
                         "acceptance_criteria": acs}],
        }]}})
        return [a["ac_id"] for a in acs]

    def seed_task(self, task_id="T1", **overrides):
        task = {
            "task_id": task_id, "story_id": "E1-S1", "title": f"Do {task_id}",
            "intent": "why", "layer": 0, "parallel_safe": True,
            "size": "small", "complexity": "low", "est_files": 1,
            "validation_cmd": f"npm test -- {task_id}.test.ts",
            "covers_ac": ["E1-S1-AC1"], "depends_on": [],
            "files_claimed": [f"src/{task_id}.ts"],
            "tests_planned": [{"name": f"{task_id} works", "test_type": "unit",
                                "covers_ac": ["E1-S1-AC1"]}],
        }
        task.update(overrides)
        self.load({"tasks": [task]})
        return task


# --------------------------------------------------------------- task packet

class TaskPacketTest(KbDbCase):
    """A worker must receive its own task, and demonstrably not the whole board."""

    def test_packet_carries_only_this_task_s_acceptance_criteria(self):
        self.seed_backlog(n_acs=4)
        self.seed_task("T1", covers_ac=["E1-S1-AC1"])
        self.seed_task("T2", covers_ac=["E1-S1-AC2", "E1-S1-AC3"],
                       files_claimed=["src/T2.ts"])

        packet = json.loads(self.kb_ok("packet", "--task-id", "T1").stdout)
        ac_ids = [a["id"] for a in packet["task"]["acceptanceCriteria"]]
        self.assertEqual(ac_ids, ["E1-S1-AC1"])

        blob = json.dumps(packet)
        for foreign in ("E1-S1-AC2", "E1-S1-AC3", "E1-S1-AC4", "T2", "src/T2.ts"):
            self.assertNotIn(foreign, blob,
                             f"{foreign} belongs to another task or nobody")

    def test_packet_carries_paths_and_budgets_not_file_contents(self):
        self.seed_backlog()
        self.seed_task("T1", files_claimed=["src/a.ts", "src/a.test.ts"])
        packet = json.loads(self.kb_ok("packet", "--task-id", "T1").stdout)

        # Sorted, so the same task always produces a byte-identical packet —
        # which is what lets the dispatch hook's size check be reproducible.
        self.assertEqual(packet["task"]["candidateFiles"],
                         ["src/a.test.ts", "src/a.ts"])
        self.assertEqual(packet["task"]["validation"]["commands"],
                         ["npm test -- T1.test.ts"])
        self.assertEqual(packet["task"]["budgets"]["maxTurns"], 40)
        self.assertEqual(packet["task"]["budgets"]["hardTurns"], 60)
        # Hard limit is omp's force-stop point: 1.5x the soft request budget.
        self.assertEqual(packet["task"]["budgets"]["hardTurns"],
                         int(packet["task"]["budgets"]["maxTurns"] * 1.5))

    def test_packet_size_is_reported_and_stays_small(self):
        self.seed_backlog()
        self.seed_task("T1")
        packet = json.loads(self.kb_ok("packet", "--task-id", "T1").stdout)
        self.assertLess(packet["meta"]["sizeChars"], 2000)
        self.assertEqual(packet["meta"]["maxChars"], 20000)

    def test_oversized_packet_fails_instead_of_becoming_a_session(self):
        self.seed_backlog()
        self.seed_task("T1", intent="x" * 30000)

        proc = self.kb("packet", "--task-id", "T1")
        self.assertEqual(proc.returncode, 1)
        self.assertIn("over the", proc.stderr)
        self.assertEqual(proc.stdout, "", "nothing is emitted for a rejected packet")

        # The escape hatch exists, and says so on stderr rather than silently.
        forced = self.kb_ok("packet", "--task-id", "T1", "--warn-only")
        self.assertIn("warning:", forced.stderr)
        self.assertGreater(len(forced.stdout), 30000)

    def test_shared_surface_becomes_an_explicit_constraint(self):
        self.seed_backlog()
        self.seed_task("T1", files_claimed=["src/routes.ts"],
                       shared_surface=["src/routes.ts"])
        packet = json.loads(self.kb_ok("packet", "--task-id", "T1").stdout)
        self.assertTrue(any("Shared surface" in c
                            for c in packet["task"]["constraints"]))

    def test_unknown_task_is_an_error_not_an_empty_packet(self):
        proc = self.kb("packet", "--task-id", "T404")
        self.assertEqual(proc.returncode, 1)
        self.assertIn("no such task", proc.stderr)


# ---------------------------------------------------------- oversized tasks

class OversizedTaskTest(KbDbCase):
    """The incident had one worker change 23 files and add 26 tests."""

    def test_a_normal_task_is_not_flagged(self):
        self.seed_backlog()
        self.seed_task("T1")
        check = json.loads(self.kb_ok("get", "plan-check").stdout)
        self.assertEqual(check["oversized_tasks"], [])

    def test_the_incident_shaped_task_is_flagged_with_reasons(self):
        acs = self.seed_backlog(n_acs=8)
        self.seed_task(
            "T1",
            covers_ac=acs,
            files_claimed=[f"src/f{i}.ts" for i in range(23)],
            tests_planned=[{"name": f"test {i}", "test_type": "unit",
                            "covers_ac": [acs[0]]} for i in range(26)],
        )
        flagged = json.loads(self.kb_ok("get", "plan-check").stdout)["oversized_tasks"]
        self.assertEqual([f["task_id"] for f in flagged], ["T1"])

        reasons = " ".join(flagged[0]["reasons"])
        self.assertIn("files_claimed=23", reasons)
        self.assertIn("tests_planned=26", reasons)
        self.assertIn("covers_ac=8", reasons)

    def test_a_self_declared_large_task_is_flagged_without_needing_the_counts(self):
        self.seed_backlog()
        self.seed_task("T1", size="large")
        flagged = json.loads(self.kb_ok("get", "plan-check").stdout)["oversized_tasks"]
        self.assertEqual(flagged[0]["task_id"], "T1")
        self.assertIn("declared size=large", flagged[0]["reasons"])

    def test_an_estimate_counts_even_before_files_are_claimed(self):
        self.seed_backlog()
        self.seed_task("T1", est_files=20, files_claimed=["src/a.ts"])
        flagged = json.loads(self.kb_ok("get", "plan-check").stdout)["oversized_tasks"]
        self.assertIn("est_files=20 exceeds 8", " ".join(flagged[0]["reasons"]))

    def test_the_other_plan_checks_still_work(self):
        self.seed_backlog()
        self.seed_task("T1", files_claimed=["src/shared.ts"])
        self.seed_task("T2", files_claimed=["src/shared.ts"])
        check = json.loads(self.kb_ok("get", "plan-check").stdout)
        conflicts = check["parallel_file_conflicts"]
        self.assertEqual(len(conflicts), 1)
        self.assertEqual(conflicts[0]["path"], "src/shared.ts")


# ------------------------------------------------------- review independence

class ReviewIndependenceTest(KbDbCase):
    """Two reviewers are only worth two if the second formed a view first."""

    REVIEWER = {"review": {"findings": [
        {"id": "R1", "severity": "major", "category": "correctness",
         "location": "src/a.ts:41", "claim": "off by one", "evidence": "e"}]}}
    CRITIC = {"critique": {"findings": [
        {"id": "C1", "severity": "minor", "category": "tests",
         "location": "src/b.ts:10", "claim": "weak assertion", "evidence": "e"}]}}

    def test_reviewer_findings_are_unreadable_until_the_critic_records_its_own(self):
        self.load(self.REVIEWER)

        blocked = self.kb("get", "findings", "--author", "reviewer")
        self.assertEqual(blocked.returncode, 1)
        self.assertIn("author='critic'", blocked.stderr)
        self.assertEqual(blocked.stdout, "")

        merged_blocked = self.kb("get", "findings", "--merged")
        self.assertEqual(merged_blocked.returncode, 1,
                         "consolidation is downstream of both passes")

        self.load(self.CRITIC)
        self.kb_ok("get", "findings", "--author", "reviewer")
        self.kb_ok("get", "findings", "--merged")

    def test_the_gate_does_not_block_unrelated_reads(self):
        self.load(self.REVIEWER)
        # The critic's own findings, and the unfiltered list, stay readable —
        # the gate exists to stop anchoring, not to hide the table.
        self.kb_ok("get", "findings", "--author", "critic")
        self.kb_ok("get", "findings")

    def test_merged_findings_deduplicate_deterministically(self):
        self.load(self.REVIEWER)
        self.load({"critique": {"findings": [
            # Same defect, three lines off and lower severity: one row, not two.
            {"id": "C1", "severity": "minor", "category": "correctness",
             "location": "src/a.ts:44", "claim": "index is wrong", "evidence": "e"},
            {"id": "C2", "severity": "major", "category": "security",
             "location": "src/c.ts:9", "claim": "unescaped", "evidence": "e"},
        ]}})

        first = self.kb_ok("get", "findings", "--merged").stdout
        second = self.kb_ok("get", "findings", "--merged").stdout
        self.assertEqual(first, second, "two runs produce identical output")

        merged = json.loads(first)
        self.assertEqual(len(merged), 2)
        by_id = {m["finding_id"]: m for m in merged}
        self.assertIn("R1", by_id, "the reviewer's id wins the merged row")
        self.assertEqual(by_id["R1"]["authors"], "critic,reviewer")
        self.assertEqual(by_id["R1"]["corroborating_ids"], "C1")
        self.assertEqual(by_id["R1"]["severity"], "major",
                         "the more severe of the two assessments is kept")
        self.assertEqual(by_id["C2"]["authors"], "critic")

    def test_merged_findings_are_ordered_by_severity(self):
        self.load({"review": {"findings": [
            {"id": "R1", "severity": "minor", "category": "style",
             "location": "src/a.ts:1", "claim": "c", "evidence": "e"}]}})
        self.load({"critique": {"findings": [
            {"id": "C1", "severity": "critical", "category": "security",
             "location": "src/b.ts:1", "claim": "c", "evidence": "e"}]}})
        merged = json.loads(self.kb_ok("get", "findings", "--merged").stdout)
        self.assertEqual([m["finding_id"] for m in merged], ["C1", "R1"])


# ------------------------------------------------------------------ telemetry

class TelemetryTest(KbDbCase):
    def test_events_round_trip_through_load_and_get(self):
        self.load({"events": [
            {"kind": "infra_pause", "body": {"until": "2026-01-01T00:00:00Z",
                                              "column": "in_progress"}},
            {"kind": "dispatch", "body": {"width": 2}},
        ]})
        rows = json.loads(self.kb_ok("get", "events", "--format", "json").stdout)
        self.assertEqual([r["kind"] for r in rows], ["infra_pause", "dispatch"])
        self.assertEqual(json.loads(rows[1]["body"])["width"], 2)

        only = json.loads(
            self.kb_ok("get", "events", "--kind", "dispatch",
                        "--format", "json").stdout)
        self.assertEqual(len(only), 1)

    def test_a_string_body_is_stored_as_written(self):
        self.load({"events": [{"kind": "note", "body": "plain text"}]})
        rows = json.loads(self.kb_ok("get", "events", "--format", "json").stdout)
        self.assertEqual(rows[0]["body"], "plain text")


# ----------------------------------------------------- backward compatibility

class BackwardCompatibilityTest(KbDbCase):
    def test_a_database_written_before_the_new_columns_still_loads(self):
        # Recreate the pre-guardrails tasks table exactly, then confirm the
        # helper migrates it rather than failing or silently losing writes.
        legacy = Path(self._tmp.name) / "legacy.db"
        conn = sqlite3.connect(legacy)
        conn.executescript("""
            CREATE TABLE tasks (
              task_id TEXT PRIMARY KEY, story_id TEXT, title TEXT, intent TEXT,
              layer INTEGER, parallel_safe INTEGER NOT NULL DEFAULT 1,
              unsafe_reason TEXT, value_rank INTEGER,
              status TEXT NOT NULL DEFAULT 'todo', branch TEXT);
            INSERT INTO tasks (task_id, title) VALUES ('T1', 'existing work');
        """)
        conn.commit()
        conn.close()

        proc = subprocess.run(
            [sys.executable, str(KB_DB), "get", "tables", "--db", str(legacy)],
            capture_output=True, text=True, timeout=30)
        self.assertEqual(proc.returncode, 0, proc.stderr)

        conn = sqlite3.connect(legacy)
        columns = {r[1] for r in conn.execute("PRAGMA table_info(tasks)")}
        preserved = conn.execute(
            "SELECT title FROM tasks WHERE task_id = 'T1'").fetchone()[0]
        conn.close()

        for added in ("size", "complexity", "est_files", "validation_cmd"):
            self.assertIn(added, columns)
        self.assertEqual(preserved, "existing work", "existing rows survive")

    def test_migration_is_idempotent(self):
        for _ in range(3):
            self.kb_ok("get", "tables")
        conn = sqlite3.connect(self.db)
        columns = [r[1] for r in conn.execute("PRAGMA table_info(tasks)")]
        conn.close()
        self.assertEqual(len(columns), len(set(columns)))

    def test_a_task_payload_without_the_new_fields_still_loads(self):
        self.seed_backlog()
        self.load({"tasks": [{
            "task_id": "T1", "story_id": "E1-S1", "title": "old shape",
            "intent": "i", "layer": 0, "parallel_safe": True,
            "covers_ac": ["E1-S1-AC1"], "depends_on": [],
            "files_claimed": ["src/a.ts"], "tests_planned": [],
        }]})
        packet = json.loads(self.kb_ok("packet", "--task-id", "T1").stdout)
        self.assertIsNone(packet["task"]["size"])
        self.assertEqual(packet["task"]["validation"]["commands"], [],
                         "an unsized task yields an empty command list, not a crash")

    def test_the_shipped_selftest_still_passes(self):
        proc = subprocess.run(
            [sys.executable, str(KB_DB), "selftest",
             "--db", str(Path(self._tmp.name) / "selftest.db")],
            capture_output=True, text=True, timeout=60)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("OK", proc.stdout)


if __name__ == "__main__":
    unittest.main()
