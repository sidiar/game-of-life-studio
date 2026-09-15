"""Tests for lane-gates.py, run against the fixture project in fixtures/.

Some cases go through the CLI via subprocess (to exercise argument parsing and exit
codes exactly as the skill invokes them); a couple of the parser-internals cases call
`read_lane_gates` directly, importing the script by file path since its name has a
hyphen and can't be `import`-ed normally.
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(REPO_ROOT, "lane-gates.py")
FIXTURES = os.path.join(REPO_ROOT, "fixtures")
FIXTURE_GATES = os.path.join(FIXTURES, "docs", "implementation-artifacts", "lane-gates.yaml")
FIXTURE_STATUS = os.path.join(FIXTURES, "docs", "implementation-artifacts", "sprint-status.yaml")


def _load_module():
    spec = importlib.util.spec_from_file_location("lane_gates", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lane_gates = _load_module()


def run_cli(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, SCRIPT, *args],
        capture_output=True, text=True, cwd=REPO_ROOT,
    )


class CheckCommandTests(unittest.TestCase):
    def test_gated_story_exits_2_with_reason(self):
        result = run_cli("--root", FIXTURES, "check", "3-2-widget-grid")
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn("GATED 3-2-widget-grid", result.stdout)
        self.assertIn("requires 2-3-password-reset", result.stdout)
        self.assertIn("why: The widget grid renders account state", result.stdout)

    def test_epic_gate_satisfied_exits_0(self):
        result = run_cli("--root", FIXTURES, "check", "3-1-dashboard-layout")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("OPEN 3-1-dashboard-layout (1 gate(s) satisfied)", result.stdout)

    def test_story_with_no_gate_exits_0(self):
        result = run_cli("--root", FIXTURES, "check", "2-1-login-page")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("OPEN 2-1-login-page (no gates)", result.stdout)

    def test_unknown_story_exits_1(self):
        result = run_cli("--root", FIXTURES, "check", "9-9-not-real")
        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR:", result.stderr)
        self.assertIn("not in sprint-status", result.stderr)


class AnalysedCommandTests(unittest.TestCase):
    def test_analysed_pair_exits_0(self):
        result = run_cli("--root", FIXTURES, "analysed", "--epic", "3")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("ANALYSED epic 3 vs 2", result.stdout)

    def test_missing_analysed_pair_exits_2(self):
        with open(FIXTURE_GATES) as fh:
            text = fh.read()
        lines = text.splitlines(keepends=True)
        # Drop the `analysed:` header and its one list item (4 lines: lane, against,
        # date, approved_by), leaving `gates:` and everything after it intact.
        start = next(i for i, l in enumerate(lines) if l.startswith("analysed:"))
        del lines[start:start + 5]
        with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as tmp:
            tmp.writelines(lines)
            tmp_path = tmp.name
        try:
            result = run_cli("--root", FIXTURES, "--gates-file", tmp_path,
                             "analysed", "--epic", "3")
            self.assertEqual(result.returncode, 2, result.stderr)
            self.assertIn("UNANALYSED epic 3 vs epic(s) 2", result.stdout)
        finally:
            os.unlink(tmp_path)

    def test_no_other_epic_in_progress(self):
        result = run_cli("--root", FIXTURES, "analysed", "--epic", "2")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("ANALYSED epic 2 — no other epic is in progress", result.stdout)


class ListCommandTests(unittest.TestCase):
    def test_list_prints_one_line_per_gate(self):
        result = run_cli("--root", FIXTURES, "list")
        self.assertEqual(result.returncode, 0, result.stderr)
        lines = [l for l in result.stdout.splitlines() if l.strip()]
        self.assertEqual(len(lines), 2)
        self.assertTrue(lines[0].startswith("GATED"))
        self.assertIn("3-2-widget-grid", lines[0])
        self.assertTrue(lines[1].startswith("open "))
        self.assertIn("3-1-dashboard-layout", lines[1])


class ConfigResolutionTests(unittest.TestCase):
    def test_no_config_and_no_flags_exits_1(self):
        with tempfile.TemporaryDirectory() as empty_root:
            result = run_cli("--root", empty_root, "list")
            self.assertEqual(result.returncode, 1)
            self.assertIn("implement-next-story.toml", result.stderr)

    def test_flags_override_config(self):
        # Point --status-file at an alternate file where the gated story's
        # prerequisite is already done, flipping the verdict from GATED to OPEN.
        alt_status = textwrap.dedent("""\
            last_updated: 2026-02-01

            development_status:
              epic-2: done
              2-1-login-page: done
              2-2-signup-flow: done
              2-3-password-reset: done
              epic-3: backlog
              3-1-dashboard-layout: backlog
              3-2-widget-grid: backlog
        """)
        with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as tmp:
            tmp.write(alt_status)
            tmp_path = tmp.name
        try:
            result = run_cli("--root", FIXTURES, "--status-file", tmp_path,
                             "check", "3-2-widget-grid")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("OPEN 3-2-widget-grid", result.stdout)
        finally:
            os.unlink(tmp_path)


class MalformedGatesFileTests(unittest.TestCase):
    def _run_with(self, gates_text: str) -> subprocess.CompletedProcess:
        with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as tmp:
            tmp.write(gates_text)
            tmp_path = tmp.name
        try:
            return run_cli("--root", FIXTURES, "--gates-file", tmp_path, "list")
        finally:
            os.unlink(tmp_path)

    def test_nested_mapping_exits_1(self):
        result = self._run_with(textwrap.dedent("""\
            gates:
              - story: 3-2-widget-grid
                requires:
                  nested: true
        """))
        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR:", result.stderr)
        self.assertIn("nested mappings are not supported", result.stderr)

    def test_bad_top_level_line_exits_1(self):
        result = self._run_with("this is not a key line\n")
        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR:", result.stderr)
        self.assertIn("expected a top-level", result.stderr)

    def test_unknown_epic_in_requires_exits_1(self):
        with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as tmp:
            tmp.write(textwrap.dedent("""\
                gates:
                  - story: 1-1-project-scaffold
                    requires: epic-9
                    why: no such epic exists
            """))
            tmp_path = tmp.name
        try:
            result = run_cli("--root", FIXTURES, "--gates-file", tmp_path,
                             "check", "1-1-project-scaffold")
            self.assertEqual(result.returncode, 1)
            self.assertIn("ERROR:", result.stderr)
            self.assertIn("no 9-* stories", result.stderr)
        finally:
            os.unlink(tmp_path)


class ReadLaneGatesUnitTests(unittest.TestCase):
    """Direct tests of read_lane_gates(), imported as a module."""

    def _write(self, text: str) -> str:
        fh = tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False)
        fh.write(text)
        fh.close()
        self.addCleanup(os.unlink, fh.name)
        return fh.name

    def test_block_scalar_folds_to_one_line(self):
        path = self._write(textwrap.dedent("""\
            gates:
              - story: 1-1-project-scaffold
                requires: epic-1
                why: >-
                  Line one of the reason.
                  Line two of the reason.
        """))
        doc = lane_gates.read_lane_gates(path)
        self.assertEqual(len(doc["gates"]), 1)
        self.assertEqual(doc["gates"][0]["why"],
                         "Line one of the reason. Line two of the reason.")

    def test_inline_comment_is_stripped(self):
        path = self._write(textwrap.dedent("""\
            gates:
              - story: 1-1-project-scaffold
                requires: epic-1   # inline note, should not end up in the value
                why: plain reason
        """))
        doc = lane_gates.read_lane_gates(path)
        self.assertEqual(doc["gates"][0]["requires"], "epic-1")

    def test_real_fixture_parses_with_expected_shape(self):
        doc = lane_gates.read_lane_gates(FIXTURE_GATES)
        self.assertEqual(len(doc["analysed"]), 1)
        self.assertEqual(doc["analysed"][0], {
            "lane": "3", "against": "2", "date": "2026-01-10", "approved_by": "the owner",
        })
        self.assertEqual(len(doc["gates"]), 2)


if __name__ == "__main__":
    unittest.main()
