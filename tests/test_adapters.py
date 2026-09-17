"""Conformance tests for the adapter seam (adapters/CONTRACT.md §11):

  * every adapters/*/adapter.md shipped with the skill has the shape the orchestrator
    depends on — parametrised over the directory, so a second adapter is picked up
    automatically;
  * lane-gates.py's `read_config` validates `[adapter]` the way it validates `[paths]`;
  * the `adapter` subcommand resolves `name =` / `dir =` to a path, or fails cleanly.
"""

from __future__ import annotations

import glob
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
ADAPTERS_DIR = os.path.join(REPO_ROOT, "adapters")

REQUIRED_H2 = ["## Requires", "## Create", "## Implement", "## Review", "## Notes"]


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


def _adapter_files() -> list[str]:
    return sorted(glob.glob(os.path.join(ADAPTERS_DIR, "*", "adapter.md")))


def _split_h2_sections(text: str) -> dict[str, str]:
    """{'## Heading': body} — body is everything up to the next H2 or EOF."""
    sections: dict[str, str] = {}
    current: str | None = None
    buf: list[str] = []
    for line in text.splitlines():
        if line.startswith("## "):
            if current is not None:
                sections[current] = "\n".join(buf)
            current = line.strip()
            buf = []
        elif current is not None:
            buf.append(line)
    if current is not None:
        sections[current] = "\n".join(buf)
    return sections


# ------------------------------------------------------------------ adapter.md shape

class AdapterShapeTests(unittest.TestCase):
    """Every adapters/*/adapter.md, checked against CONTRACT.md §11."""

    def test_every_shipped_adapter_conforms(self):
        files = _adapter_files()
        self.assertTrue(files, f"no adapters/*/adapter.md found under {ADAPTERS_DIR}")
        for path in files:
            with self.subTest(adapter=os.path.relpath(path, REPO_ROOT)):
                self._check_one(path)

    def _check_one(self, path: str) -> None:
        with open(path) as fh:
            text = fh.read()
        lines = text.splitlines()
        self.assertLess(len(lines), 100,
                        f"{path}: {len(lines)} lines, must be under 100 (§2's context budget)")

        h2s = [line.strip() for line in lines if line.startswith("## ")]
        self.assertEqual(h2s, REQUIRED_H2,
                         f"{path}: expected exactly {REQUIRED_H2} at H2 level, got {h2s}")

        sections = _split_h2_sections(text)
        self.assertTrue(sections["## Requires"].strip(), f"{path}: `## Requires` is empty")

        review = sections["## Review"]
        for word in ("patch", "defer", "decision-needed", "done"):
            self.assertIn(word, review, f"{path}: `## Review` does not mention {word!r}")

        notes = sections["## Notes"]
        self.assertIn("resume", notes.lower(), f"{path}: `## Notes` does not mention 'resume'")


# ------------------------------------------------------------------ read_config([adapter])

class ReadConfigAdapterTests(unittest.TestCase):
    """`read_config` validates `[adapter]` whenever a config file is actually read."""

    def _write(self, text: str) -> str:
        fh = tempfile.NamedTemporaryFile("w", suffix=".toml", delete=False, dir=tempfile.mkdtemp())
        fh.write(text)
        fh.close()
        self.addCleanup(os.unlink, fh.name)
        return fh.name

    def test_fixture_config_is_accepted(self):
        doc = lane_gates.read_config(FIXTURES, None)
        self.assertEqual(doc["adapter"], {"name": "bmad"})

    def test_no_adapter_table_is_rejected(self):
        path = self._write(textwrap.dedent("""\
            [paths]
            status_file = "a"
        """))
        with self.assertRaises(lane_gates.GateError) as ctx:
            lane_gates.read_config(os.path.dirname(path), path)
        self.assertIn(path, str(ctx.exception))
        self.assertIn("[adapter]", str(ctx.exception))
        self.assertIn("name / dir", str(ctx.exception))

    def test_both_keys_is_rejected(self):
        path = self._write(textwrap.dedent("""\
            [adapter]
            name = "bmad"
            dir = "docs/my-adapter"
            [paths]
            status_file = "a"
        """))
        with self.assertRaises(lane_gates.GateError) as ctx:
            lane_gates.read_config(os.path.dirname(path), path)
        self.assertIn(path, str(ctx.exception))
        self.assertIn("name / dir", str(ctx.exception))

    def test_neither_key_is_rejected(self):
        path = self._write(textwrap.dedent("""\
            [adapter]
            [paths]
            status_file = "a"
        """))
        with self.assertRaises(lane_gates.GateError) as ctx:
            lane_gates.read_config(os.path.dirname(path), path)
        self.assertIn(path, str(ctx.exception))
        self.assertIn("name / dir", str(ctx.exception))

    def test_non_string_value_is_rejected(self):
        path = self._write(textwrap.dedent("""\
            [adapter]
            name = 5
            [paths]
            status_file = "a"
        """))
        with self.assertRaises(lane_gates.GateError) as ctx:
            lane_gates.read_config(os.path.dirname(path), path)
        self.assertIn(path, str(ctx.exception))
        self.assertIn("name", str(ctx.exception))
        self.assertIn("must be a string", str(ctx.exception))


# ------------------------------------------------------------------ `adapter` subcommand

class AdapterSubcommandTests(unittest.TestCase):
    def test_name_resolves_to_the_shipped_adapter(self):
        result = run_cli("--root", FIXTURES, "adapter")
        self.assertEqual(result.returncode, 0, result.stderr)
        expected = os.path.abspath(os.path.join(ADAPTERS_DIR, "bmad", "adapter.md"))
        self.assertEqual(result.stdout.strip(), expected)

    def test_dir_resolves_relative_to_root(self):
        with tempfile.TemporaryDirectory() as root:
            adapter_dir = os.path.join(root, "somewhere")
            os.makedirs(adapter_dir)
            adapter_file = os.path.join(adapter_dir, "adapter.md")
            with open(adapter_file, "w") as fh:
                fh.write("## Requires\n## Create\n## Implement\n## Review\n## Notes\n")
            config = os.path.join(root, "implement-next-story.toml")
            with open(config, "w") as fh:
                fh.write(textwrap.dedent("""\
                    [adapter]
                    dir = "somewhere"
                    [paths]
                    status_file = "a"
                """))
            result = run_cli("--root", root, "--config", config, "adapter")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), os.path.abspath(adapter_file))

    def test_missing_dir_adapter_exits_2_naming_the_path(self):
        with tempfile.TemporaryDirectory() as root:
            config = os.path.join(root, "implement-next-story.toml")
            with open(config, "w") as fh:
                fh.write(textwrap.dedent("""\
                    [adapter]
                    dir = "nowhere"
                    [paths]
                    status_file = "a"
                """))
            result = run_cli("--root", root, "--config", config, "adapter")
            self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
            expected_path = os.path.abspath(os.path.join(root, "nowhere", "adapter.md"))
            self.assertIn(expected_path, result.stderr)


if __name__ == "__main__":
    unittest.main()
