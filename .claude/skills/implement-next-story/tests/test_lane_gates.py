"""Tests for lane-gates.py, run against the fixture project in fixtures/.

Some cases go through the CLI via subprocess (to exercise argument parsing and exit
codes exactly as the skill invokes them); a couple of the parser-internals cases call
`read_lane_gates` directly, importing the script by file path since its name has a
hyphen and can't be `import`-ed normally.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import textwrap
import time
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


# ------------------------------------------------------------------ resolve / lock

def make_repo(root: str) -> None:
    """A one-commit git repo at `root`, quiet and identity-configured."""
    subprocess.run(["git", "init", "-q", root], check=True)
    subprocess.run(["git", "-C", root, "-c", "user.name=t", "-c", "user.email=t@t",
                    "commit", "-q", "--allow-empty", "-m", "init"], check=True)


def add_lane(root: str, epic: int) -> str:
    path = os.path.join(root, ".claude", "worktrees", f"lane-epic-{epic}")
    subprocess.run(["git", "-C", root, "worktree", "add", "-q", "--detach", path], check=True)
    return os.path.realpath(path)


class TempRepoTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = os.path.realpath(os.path.join(self.tmp.name, "repo"))
        make_repo(self.root)

    def cli(self, *args: str, session: str | None = "sess-a", home: str | None = None):
        env = {k: v for k, v in os.environ.items() if k not in ("CLAUDE_CODE_SESSION_ID", "HOME")}
        if session:
            env["CLAUDE_CODE_SESSION_ID"] = session
        env["HOME"] = home or os.path.join(self.tmp.name, "home-without-transcripts")
        return subprocess.run([sys.executable, SCRIPT, *args], capture_output=True, text=True, env=env)


class ResolveCommandTests(TempRepoTest):
    def test_primary_bare_call_picks_the_one_in_progress_epic(self):
        result = self.cli("--root", self.root, "--status-file", FIXTURE_STATUS, "resolve")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(result.stdout.startswith("LANE 2 — "), result.stdout)
        self.assertIn("primary checkout", result.stdout)

    def test_epic_with_a_lane_worktree_is_refused_in_the_primary(self):
        lane = add_lane(self.root, 3)
        result = self.cli("--root", self.root, "resolve", "--epic", "3")
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertTrue(result.stdout.startswith("WRONG_TREE"), result.stdout)
        self.assertIn(lane, result.stdout)

    def test_epic_without_a_lane_worktree_runs_in_the_primary(self):
        add_lane(self.root, 3)
        result = self.cli("--root", self.root, "resolve", "--epic", "2")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(result.stdout.startswith("LANE 2 — "), result.stdout)

    def test_lane_worktree_knows_its_own_epic_without_the_flag(self):
        lane = add_lane(self.root, 3)
        result = self.cli("--root", lane, "resolve")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(result.stdout.startswith("LANE 3 — "), result.stdout)

    def test_lane_worktree_refuses_another_epic(self):
        lane = add_lane(self.root, 3)
        result = self.cli("--root", lane, "resolve", "--epic", "2")
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertTrue(result.stdout.startswith("WRONG_TREE"), result.stdout)
        self.assertIn("primary checkout", result.stdout)

    def test_two_unhoused_in_progress_epics_is_ambiguous(self):
        status = os.path.join(self.tmp.name, "status.yaml")
        with open(status, "w") as fh:
            fh.write(textwrap.dedent("""\
                development_status:
                  epic-2: in-progress
                  2-2-signup-flow: backlog
                  epic-3: in-progress
                  3-1-dashboard-layout: backlog
            """))
        result = self.cli("--root", self.root, "--status-file", status, "resolve")
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn("AMBIGUOUS epics 2, 3", result.stdout)
        # Housing one of them in a worktree settles it for the primary.
        add_lane(self.root, 3)
        result = self.cli("--root", self.root, "--status-file", status, "resolve")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(result.stdout.startswith("LANE 2 — "), result.stdout)

    def test_primary_moves_on_when_the_in_progress_epic_is_housed(self):
        add_lane(self.root, 2)  # the fixture's in-progress epic now lives in a worktree
        result = self.cli("--root", self.root, "--status-file", FIXTURE_STATUS, "resolve")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(result.stdout.startswith("LANE 3 — "), result.stdout)
        self.assertIn("3-1-dashboard-layout", result.stdout)

    def test_bare_call_without_status_file_exits_1(self):
        result = self.cli("--root", self.root, "resolve")
        self.assertEqual(result.returncode, 1)
        self.assertIn("no status_file", result.stderr)


class LockCommandTests(TempRepoTest):
    def lock_file(self, root: str | None = None) -> str:
        git_dir = subprocess.run(["git", "-C", root or self.root, "rev-parse", "--git-dir"],
                                 capture_output=True, text=True, check=True).stdout.strip()
        return os.path.join(os.path.realpath(os.path.join(root or self.root, git_dir)),
                            "implement-next-story.lock")

    def home_with_transcript(self, session: str, age_seconds: float) -> str:
        """A fake ~/.claude/projects tree whose transcript for `session` was last written
        `age_seconds` ago."""
        home = os.path.join(self.tmp.name, f"home-{session}")
        project = os.path.join(home, ".claude", "projects", "some-project")
        os.makedirs(project)
        transcript = os.path.join(project, f"{session}.jsonl")
        open(transcript, "w").close()
        then = time.time() - age_seconds
        os.utime(transcript, (then, then))
        return home

    def test_acquire_reenter_release_round_trip(self):
        result = self.cli("--root", self.root, "lock", "acquire", "--epic", "2")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(result.stdout.startswith("LOCKED epic 2 by session sess-a"), result.stdout)
        self.assertTrue(os.path.exists(self.lock_file()))

        result = self.cli("--root", self.root, "lock", "acquire", "--epic", "2", "--story", "2-2-signup-flow")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("(re-entered)", result.stdout)
        with open(self.lock_file()) as fh:
            self.assertEqual(json.load(fh)["story"], "2-2-signup-flow")

        result = self.cli("--root", self.root, "lock", "status")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("HELD (this session)", result.stdout)

        result = self.cli("--root", self.root, "lock", "release")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(result.stdout.startswith("UNLOCKED"), result.stdout)
        self.assertFalse(os.path.exists(self.lock_file()))

        result = self.cli("--root", self.root, "lock", "release")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("(no lock)", result.stdout)

    def test_lock_is_never_inside_the_working_tree(self):
        self.assertTrue(self.lock_file().startswith(os.path.join(self.root, ".git") + os.sep))
        lane = add_lane(self.root, 3)
        self.assertIn(os.path.join(".git", "worktrees", "lane-epic-3"), self.lock_file(lane))

    def test_a_worktree_and_the_primary_lock_independently(self):
        lane = add_lane(self.root, 3)
        self.assertEqual(self.cli("--root", self.root, "lock", "acquire", "--epic", "2").returncode, 0)
        result = self.cli("--root", lane, "lock", "acquire", "--epic", "3", session="sess-b")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotEqual(self.lock_file(), self.lock_file(lane))

    def test_live_holder_makes_the_tree_busy(self):
        self.assertEqual(self.cli("--root", self.root, "lock", "acquire", "--epic", "2").returncode, 0)
        home = self.home_with_transcript("sess-a", age_seconds=60)
        result = self.cli("--root", self.root, "lock", "acquire", "--epic", "3", session="sess-b", home=home)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertTrue(result.stdout.startswith("BUSY"), result.stdout)
        self.assertIn("held by session sess-a for epic 2", result.stdout)
        self.assertIn("last active 1m ago", result.stdout)
        self.assertIn("lock release --force", result.stdout)

    def test_holder_without_a_transcript_is_still_busy(self):
        self.assertEqual(self.cli("--root", self.root, "lock", "acquire", "--epic", "2").returncode, 0)
        result = self.cli("--root", self.root, "lock", "acquire", "--epic", "3", session="sess-b")
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn("no transcript found", result.stdout)

    def test_stale_holder_is_taken_over(self):
        self.assertEqual(self.cli("--root", self.root, "lock", "acquire", "--epic", "2").returncode, 0)
        home = self.home_with_transcript("sess-a", age_seconds=2 * 3600)
        result = self.cli("--root", self.root, "lock", "acquire", "--epic", "3", session="sess-b", home=home)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("LOCKED epic 3 by session sess-b", result.stdout)
        self.assertIn("took over from session sess-a, silent for 2h00m", result.stdout)
        with open(self.lock_file()) as fh:
            self.assertEqual(json.load(fh)["session"], "sess-b")

    def test_stale_after_is_tunable(self):
        self.assertEqual(self.cli("--root", self.root, "lock", "acquire", "--epic", "2").returncode, 0)
        home = self.home_with_transcript("sess-a", age_seconds=600)
        result = self.cli("--root", self.root, "lock", "acquire", "--epic", "3", "--stale-after", "300",
                          session="sess-b", home=home)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("took over", result.stdout)

    def test_release_of_another_sessions_lock_needs_force(self):
        self.assertEqual(self.cli("--root", self.root, "lock", "acquire", "--epic", "2").returncode, 0)
        result = self.cli("--root", self.root, "lock", "release", session="sess-b")
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn("pass --force", result.stdout)
        self.assertTrue(os.path.exists(self.lock_file()))
        result = self.cli("--root", self.root, "lock", "release", "--force", session="sess-b")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("UNLOCKED (forced)", result.stdout)
        self.assertFalse(os.path.exists(self.lock_file()))

    def test_status_held_by_another_session_exits_2(self):
        self.assertEqual(self.cli("--root", self.root, "lock", "acquire", "--epic", "2").returncode, 0)
        result = self.cli("--root", self.root, "lock", "status", session="sess-b")
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertTrue(result.stdout.startswith("HELD by session sess-a"), result.stdout)
        result = self.cli("--root", self.root, "lock", "status", session=None)
        self.assertEqual(result.returncode, 2, result.stderr)

    def test_acquire_without_a_session_id_exits_1(self):
        result = self.cli("--root", self.root, "lock", "acquire", "--epic", "2", session=None)
        self.assertEqual(result.returncode, 1)
        self.assertIn("CLAUDE_CODE_SESSION_ID", result.stderr)
        self.assertFalse(os.path.exists(self.lock_file()))

    def test_malformed_lock_exits_1(self):
        os.makedirs(os.path.dirname(self.lock_file()), exist_ok=True)
        with open(self.lock_file(), "w") as fh:
            fh.write("not json")
        result = self.cli("--root", self.root, "lock", "acquire", "--epic", "2")
        self.assertEqual(result.returncode, 1)
        self.assertIn("unreadable lock", result.stderr)


if __name__ == "__main__":
    unittest.main()
