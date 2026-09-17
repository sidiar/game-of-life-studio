"""Tests for story-run-stats.py.

The script reads three things from the environment/filesystem:
  * $CLAUDE_CODE_SESSION_ID / $TMPDIR — to locate the per-session mark-state JSON file
    (see `state_path`).
  * ~/.claude/projects/<slug>/<session>.jsonl — the main (orchestrator) transcript.
  * ~/.claude/projects/<slug>/<session>/subagents/*.jsonl — subagent transcripts
    (see `session_dir`, `subagent_runs`).

setUp points HOME and TMPDIR at a temp dir and fabricates that layout with synthetic
JSONL transcripts, so build_report() can be exercised without touching the real
~/.claude directory.

Timeline (minutes from a fixed BASE epoch), chosen so every gap in the combined event
stream is either well under the "idle" test threshold or exactly one deliberately long
gap inside Step 2:

  marks:      step0=0   step1=5   step2=65   step3=125   end=155
  main:       1, 3 | 10, 20(non-assistant), 30, 50 | 66, 111, 120 | 130, 150
  subagent1:                12, 40, 58
  subagent2:                                              128, 129(synthetic), 145

Only gap > threshold: 66 -> 111 (45 min), inside the Step 2 window.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(REPO_ROOT, "story-run-stats.py")

BASE = datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
MODEL = "claude-sonnet-5"


def _load_module():
    spec = importlib.util.spec_from_file_location("story_run_stats", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


srs = _load_module()


def iso(minutes: float) -> str:
    return (BASE + timedelta(minutes=minutes)).isoformat().replace("+00:00", "Z")


def usage(input_, output_, cache_write, cache_read):
    return {
        "input_tokens": input_,
        "output_tokens": output_,
        "cache_creation_input_tokens": cache_write,
        "cache_read_input_tokens": cache_read,
    }


def assistant_entry(minutes: float, model: str = MODEL,
                    tok=(100, 10, 5, 2)) -> dict:
    return {
        "type": "assistant",
        "timestamp": iso(minutes),
        "message": {"model": model, "usage": usage(*tok)},
    }


def write_jsonl(path: str, entries: list[dict]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        for entry in entries:
            fh.write(json.dumps(entry) + "\n")


class StoryRunStatsTestCase(unittest.TestCase):
    """Base: builds the fake ~/.claude session layout described in the module docstring."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = os.path.join(self.tmp.name, "home")
        self.tmpdir = os.path.join(self.tmp.name, "tmp")
        os.makedirs(self.home)
        os.makedirs(self.tmpdir)
        self.session = "sess-fixture-0001"
        self.slug = "-Users-fixture-project"

        self.env_patch = mock.patch.dict(os.environ, {
            "HOME": self.home,
            "TMPDIR": self.tmpdir,
            "CLAUDE_CODE_SESSION_ID": self.session,
        })
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)

        project_dir = os.path.join(self.home, ".claude", "projects", self.slug)
        self.main_transcript = os.path.join(project_dir, f"{self.session}.jsonl")
        subagents_dir = os.path.join(project_dir, self.session, "subagents")

        main_entries = [
            assistant_entry(1), assistant_entry(3),
            {"type": "user", "timestamp": iso(20), "message": {}},  # non-assistant: skipped
            assistant_entry(10), assistant_entry(30), assistant_entry(50),
            assistant_entry(66), assistant_entry(111), assistant_entry(120),
            assistant_entry(130), assistant_entry(150),
        ]
        write_jsonl(self.main_transcript, main_entries)

        sub1_tok = (50, 5, 1, 1)
        write_jsonl(os.path.join(subagents_dir, "sub1.jsonl"), [
            assistant_entry(12, tok=sub1_tok),
            assistant_entry(40, tok=sub1_tok),
            assistant_entry(58, tok=sub1_tok),
        ])

        sub2_tok = (50, 5, 1, 1)
        write_jsonl(os.path.join(subagents_dir, "sub2.jsonl"), [
            assistant_entry(128, tok=sub2_tok),
            assistant_entry(129, model="<synthetic>", tok=(9999, 9999, 9999, 9999)),
            assistant_entry(145, tok=sub2_tok),
        ])

        self.state = {"marks": [
            {"label": "step0", "epoch": (BASE + timedelta(minutes=0)).timestamp()},
            {"label": "step1", "epoch": (BASE + timedelta(minutes=5)).timestamp()},
            {"label": "step2", "epoch": (BASE + timedelta(minutes=65)).timestamp()},
            {"label": "step3", "epoch": (BASE + timedelta(minutes=125)).timestamp()},
            {"label": "end", "epoch": (BASE + timedelta(minutes=155)).timestamp()},
        ]}


class BuildReportPhaseTests(StoryRunStatsTestCase):
    def test_session_dir_and_subagent_runs_found(self):
        sess_dir = srs.session_dir()
        self.assertIsNotNone(sess_dir)
        runs = srs.subagent_runs(sess_dir)
        # Both subagent transcripts have a real (non-synthetic) entry, so both count.
        self.assertEqual(len(runs), 2)

    def test_phase_rows_agents_and_tokens(self):
        block, data = srs.build_report(self.state, idle_gap_minutes=40)
        rows = {r["title"]: r for r in data["rows"]}

        self.assertEqual(rows["Step 0 — re-entry guard"]["agents"], 0)
        self.assertEqual(rows["Step 0 — re-entry guard"]["tokens"],
                         {"input": 200, "cache_write": 10, "cache_read": 4,
                          "output": 20, "total": 234})

        self.assertEqual(rows["Step 1 — create"]["agents"], 1)
        self.assertEqual(rows["Step 1 — create"]["tokens"],
                         {"input": 450, "cache_write": 18, "cache_read": 9,
                          "output": 45, "total": 522})

        self.assertEqual(rows["Step 2 — implement"]["agents"], 0)
        self.assertEqual(rows["Step 2 — implement"]["tokens"],
                         {"input": 300, "cache_write": 15, "cache_read": 6,
                          "output": 30, "total": 351})

        self.assertEqual(rows["Step 3 — review + PR"]["agents"], 1)
        self.assertEqual(rows["Step 3 — review + PR"]["tokens"],
                         {"input": 300, "cache_write": 12, "cache_read": 6,
                          "output": 30, "total": 348})

        # The synthetic-model entry (tok=9999s) must not have leaked into Step 3's sums.
        self.assertNotIn(9999, rows["Step 3 — review + PR"]["tokens"].values())

    def test_orchestrator_row_matches_main_transcript_totals(self):
        _, data = srs.build_report(self.state, idle_gap_minutes=40)
        full = srs.scan_transcript(self.main_transcript)
        self.assertEqual(full["tokens"], {"input": 1000, "cache_write": 50,
                                          "cache_read": 20, "output": 100, "total": 1170})
        orch_sum = dict(srs.ZERO)
        # Recompute the orchestrator-only total the same way build_report does, by
        # summing each phase's window scan of the main transcript, and check it equals
        # the whole-run scan (every assistant entry in the fixture falls inside exactly
        # one phase window).
        marks = {m["label"]: m["epoch"] for m in self.state["marks"]}
        windows = [(marks["step0"], marks["step1"]), (marks["step1"], marks["step2"]),
                  (marks["step2"], marks["step3"]), (marks["step3"], marks["end"])]
        for key in orch_sum:
            orch_sum[key] = sum(srs.scan_transcript(self.main_transcript, w)["tokens"][key]
                                for w in windows)
        self.assertEqual(orch_sum, full["tokens"])

    def test_total_row_sums_phases(self):
        _, data = srs.build_report(self.state, idle_gap_minutes=40)
        totals = data["totals"]
        self.assertEqual(totals, {"input": 1250, "cache_write": 55, "cache_read": 25,
                                  "output": 125, "total": 1455})
        self.assertEqual(sum(r["agents"] for r in data["rows"]), 2)

    def test_wall_clock_is_155_minutes(self):
        _, data = srs.build_report(self.state, idle_gap_minutes=40)
        self.assertEqual(data["wall"], 155 * 60)


class IdleGapTests(StoryRunStatsTestCase):
    def test_idle_gap_excluded_from_active_but_not_wall(self):
        block, data = srs.build_report(self.state, idle_gap_minutes=40)
        # Exactly one idle gap: the 45-minute silence between minute 66 and 111.
        self.assertEqual(len(data["idle"]), 1)
        gap_start, gap_len = data["idle"][0]
        self.assertAlmostEqual(gap_len, 45 * 60, delta=1)
        # Total active = wall (155m) minus the idle gap (45m) = 110m.
        self.assertAlmostEqual(data["active"], 110 * 60, delta=1)
        self.assertAlmostEqual(data["wall"], 155 * 60, delta=1)

        step2 = next(r for r in data["rows"] if r["title"] == "Step 2 — implement")
        self.assertAlmostEqual(step2["seconds"], 60 * 60, delta=1)   # wall clock: unaffected
        self.assertAlmostEqual(step2["active"], 15 * 60, delta=1)    # active: gap excluded

        self.assertIn("Active excludes 1 idle gap", block)
        self.assertIn("45m", block)

    def test_no_idle_gap_when_threshold_above_longest_silence(self):
        # 50-minute threshold is above the fixture's one 45-minute gap, so nothing
        # is excluded and Active should equal Wall clock everywhere.
        block, data = srs.build_report(self.state, idle_gap_minutes=50)
        self.assertEqual(data["idle"], [])
        self.assertAlmostEqual(data["active"], data["wall"], delta=1)
        self.assertIn("No idle gaps were excluded", block)

        step2 = next(r for r in data["rows"] if r["title"] == "Step 2 — implement")
        self.assertAlmostEqual(step2["active"], step2["seconds"], delta=1)


class WriteIntoStoryTests(unittest.TestCase):
    def test_idempotent_write(self):
        block = srs.MARKER + "\n\nSome stats content here.\n"
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as tmp:
            tmp.write("# Story 1.1\n\nSome existing story content.\n")
            path = tmp.name
        self.addCleanup(os.unlink, path)

        srs.write_into_story(path, block)
        with open(path) as fh:
            once = fh.read()

        srs.write_into_story(path, block)
        with open(path) as fh:
            twice = fh.read()

        self.assertEqual(once, twice)
        self.assertEqual(twice.count(srs.MARKER), 1)
        separator_lines = [l for l in twice.splitlines() if l.strip() == "---"]
        self.assertEqual(len(separator_lines), 1)
        # The original content survives, exactly once.
        self.assertEqual(twice.count("Some existing story content."), 1)


class MarkCommandTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state_file = os.path.join(self.tmp.name, "state.json")
        self.env = dict(os.environ)
        self.env["CLAUDE_CODE_SESSION_ID"] = "sess-mark-test"
        self.env["TMPDIR"] = self.tmp.name

    def _mark(self, label):
        return subprocess.run(
            [sys.executable, SCRIPT, "mark", label, "--state", self.state_file],
            capture_output=True, text=True, env=self.env,
        )

    def test_remarking_same_label_replaces_not_appends(self):
        first = self._mark("step0")
        self.assertEqual(first.returncode, 0, first.stderr)
        second = self._mark("step0")
        self.assertEqual(second.returncode, 0, second.stderr)

        with open(self.state_file) as fh:
            state = json.load(fh)
        step0_marks = [m for m in state["marks"] if m["label"] == "step0"]
        self.assertEqual(len(step0_marks), 1)


if __name__ == "__main__":
    unittest.main()
