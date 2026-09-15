#!/usr/bin/env python3
"""Cross-epic dependency gates for implement-next-story lanes.

Reads docs/implementation-artifacts/lane-gates.yaml and sprint-status.yaml from a checkout
that is on `main` (Step 0 guarantees that) and answers two questions mechanically, so the
orchestrator never has to read a table and reason about it:

  check <story_key>      exit 0 "OPEN"  — no gate, or every prerequisite is done on main
                         exit 2 "GATED" — with the prerequisite, its current status, and why
  analysed --epic N      exit 0 "ANALYSED" — every other in-progress epic has an `analysed`
                                             entry paired with N
                         exit 2 "UNANALYSED" — names the pair that has no analysis yet
  list                   prints every gate with its current verdict

Any exit 1 is a parse or lookup error: the file is malformed, a key is unknown, a story is
not in sprint-status. That is deliberate — a gate that cannot be read is not "open".

No PyYAML in the stdlib, so this carries a strict reader for exactly the shape documented
at the top of lane-gates.yaml (lists of flat mappings; `>-` / `|` block scalars). It rejects
anything else rather than guessing.
"""

from __future__ import annotations

import argparse
import os
import re
import sys

GATES_FILE = os.path.join("docs", "implementation-artifacts", "lane-gates.yaml")
STATUS_FILE = os.path.join("docs", "implementation-artifacts", "sprint-status.yaml")

STORY_KEY = re.compile(r"^(\d+)-(\d+)-[a-z0-9-]+$")
EPIC_KEY = re.compile(r"^epic-(\d+)$")


class GateError(Exception):
    pass


# ------------------------------------------------------------------ readers

def _strip_comment(line: str) -> str:
    # A `#` starts a comment at line start or after whitespace — the shape here never puts
    # `#` inside a value, so this is enough and errs toward dropping, not keeping.
    if line.lstrip().startswith("#"):
        return ""
    m = re.match(r"^(.*?)(?:\s+#.*)?$", line)
    return m.group(1) if m else line


def read_lane_gates(path: str) -> dict[str, list[dict[str, str]]]:
    """Parse `analysed:` and `gates:` into lists of flat string mappings."""
    try:
        with open(path) as fh:
            raw = fh.read().splitlines()
    except OSError as exc:
        raise GateError(f"cannot read {path}: {exc}")

    doc: dict[str, list[dict[str, str]]] = {}
    section: str | None = None
    item: dict[str, str] | None = None
    block_key: str | None = None
    block_lines: list[str] = []
    block_indent = 0

    def close_block() -> None:
        nonlocal block_key, block_lines
        if block_key is not None and item is not None:
            item[block_key] = " ".join(s.strip() for s in block_lines if s.strip())
        block_key, block_lines = None, []

    for n, rawline in enumerate(raw, 1):
        if block_key is not None:
            if rawline.strip() == "" or (len(rawline) - len(rawline.lstrip(" "))) >= block_indent:
                block_lines.append(rawline)
                continue
            close_block()
        line = _strip_comment(rawline.rstrip())
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip(" "))
        body = line.strip()

        if indent == 0:
            if not body.endswith(":"):
                raise GateError(f"{path}:{n}: expected a top-level `key:` line, got {body!r}")
            section = body[:-1]
            doc[section] = []
            item = None
            continue
        if section is None:
            raise GateError(f"{path}:{n}: content before any top-level key")
        if body.startswith("- "):
            item = {}
            doc[section].append(item)
            body = body[2:].strip()
        elif item is None:
            raise GateError(f"{path}:{n}: expected a `- ` list item under `{section}:`")
        if ":" not in body:
            raise GateError(f"{path}:{n}: expected `key: value`, got {body!r}")
        key, _, value = body.partition(":")
        key, value = key.strip(), value.strip()
        if not key:
            raise GateError(f"{path}:{n}: empty key")
        if value in (">-", ">", "|", "|-"):
            block_key, block_indent = key, indent + 1
            block_lines = []
            continue
        if value == "":
            raise GateError(f"{path}:{n}: `{key}` has no value (nested mappings are not supported)")
        item[key] = value.strip("'\"")
    close_block()
    return doc


def read_sprint_status(path: str) -> dict[str, str]:
    """Every `key: status` line under development_status, keyed as written."""
    try:
        with open(path) as fh:
            lines = fh.read().splitlines()
    except OSError as exc:
        raise GateError(f"cannot read {path}: {exc}")
    status: dict[str, str] = {}
    inside = False
    for line in lines:
        if line.startswith("development_status:"):
            inside = True
            continue
        if inside and line and not line.startswith(" ") and not line.startswith("#"):
            inside = False
        if not inside:
            continue
        m = re.match(r"^\s+([A-Za-z0-9-]+):\s*([A-Za-z-]+)\s*(?:#.*)?$", line)
        if m:
            status[m.group(1)] = m.group(2)
    if not status:
        raise GateError(f"{path}: no development_status entries found")
    return status


# ------------------------------------------------------------------ verdicts

def epic_of(story_key: str) -> int:
    m = STORY_KEY.match(story_key)
    if not m:
        raise GateError(f"not a story key: {story_key!r}")
    return int(m.group(1))


def prerequisite_state(req: str, status: dict[str, str]) -> tuple[bool, str]:
    """(satisfied, human description of the current state)."""
    m = EPIC_KEY.match(req)
    if m:
        epic = int(m.group(1))
        stories = {k: v for k, v in status.items() if STORY_KEY.match(k) and epic_of(k) == epic}
        if not stories:
            raise GateError(f"gate requires {req} but sprint-status has no {epic}-* stories")
        pending = sorted((k for k, v in stories.items() if v != "done"),
                         key=lambda k: int(STORY_KEY.match(k).group(2)))
        if pending:
            return False, f"{len(pending)} of {len(stories)} {epic}-* stories not done (first: {pending[0]})"
        return True, f"every {epic}-* story done"
    if not STORY_KEY.match(req):
        raise GateError(f"`requires` must be a story key or epic-N, got {req!r}")
    if req not in status:
        raise GateError(f"gate requires {req}, which is not in sprint-status")
    return status[req] == "done", f"{req} is {status[req]}"


def gates_for(story: str, gates: list[dict[str, str]]) -> list[dict[str, str]]:
    return [g for g in gates if g.get("story") == story]


def cmd_check(args, doc, status) -> int:
    if args.story not in status:
        raise GateError(f"{args.story} is not in sprint-status")
    rows = gates_for(args.story, doc.get("gates", []))
    blocked = []
    for g in rows:
        ok, state = prerequisite_state(g["requires"], status)
        if not ok:
            blocked.append((g, state))
    if blocked:
        print(f"GATED {args.story}")
        for g, state in blocked:
            print(f"  requires {g['requires']} — {state}")
            print(f"  why: {g.get('why', '(no reason recorded)')}")
        return 2
    print(f"OPEN {args.story}" + (f" ({len(rows)} gate(s) satisfied)" if rows else " (no gates)"))
    return 0


def in_progress_epics(status: dict[str, str]) -> list[int]:
    return sorted(int(EPIC_KEY.match(k).group(1)) for k, v in status.items()
                  if EPIC_KEY.match(k) and v == "in-progress")


def cmd_analysed(args, doc, status) -> int:
    pairs = set()
    for a in doc.get("analysed", []):
        try:
            pairs.add(frozenset((int(a["lane"]), int(a["against"]))))
        except (KeyError, ValueError) as exc:
            raise GateError(f"malformed `analysed` entry {a}: {exc}")
    others = [e for e in in_progress_epics(status) if e != args.epic]
    missing = [e for e in others if frozenset((args.epic, e)) not in pairs]
    if missing:
        print(f"UNANALYSED epic {args.epic} vs epic(s) {', '.join(map(str, missing))} — "
              f"run the Opening-a-lane analysis and record an `analysed` entry first")
        return 2
    if others:
        print(f"ANALYSED epic {args.epic} vs {', '.join(map(str, others))}")
    else:
        print(f"ANALYSED epic {args.epic} — no other epic is in progress")
    return 0


def cmd_list(args, doc, status) -> int:
    rows = doc.get("gates", [])
    if not rows:
        print("(no gates)")
        return 0
    for g in rows:
        ok, state = prerequisite_state(g["requires"], status)
        print(f"{'open ' if ok else 'GATED'}  {g['story']:<40} requires {g['requires']:<32} {state}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", default=".", help="repo checkout to read (must be on main)")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("check"); p.add_argument("story")
    p = sub.add_parser("analysed"); p.add_argument("--epic", type=int, required=True)
    sub.add_parser("list")
    args = parser.parse_args()
    try:
        doc = read_lane_gates(os.path.join(args.root, GATES_FILE))
        status = read_sprint_status(os.path.join(args.root, STATUS_FILE))
        return {"check": cmd_check, "analysed": cmd_analysed, "list": cmd_list}[args.command](args, doc, status)
    except GateError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
