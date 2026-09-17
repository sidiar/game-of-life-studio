#!/usr/bin/env python3
"""Cross-epic dependency gates for implement-next-story lanes.

Reads the project's lane-gates.yaml and sprint-status.yaml from a checkout that is on
`main` (Step 0 guarantees that) and answers two questions mechanically, so the
orchestrator never has to read a table and reason about it:

  check <story_key>      exit 0 "OPEN"  — no gate, or every prerequisite is done on main
                         exit 2 "GATED" — with the prerequisite, its current status, and why
  analysed --epic N      exit 0 "ANALYSED" — every other in-progress epic has an `analysed`
                                             entry paired with N
                         exit 2 "UNANALYSED" — names the pair that has no analysis yet
  list                   prints every gate with its current verdict
  adapter                exit 0 — prints the absolute path of the adapter.md that [adapter]
                         names (`name = "x"` → adapters/x/adapter.md, shipped with the
                         skill; `dir = "d"` → <root>/d/adapter.md)
                         exit 2 — that file does not exist

Two more answer "is this the right working tree, and is it free?" — the questions that
two lanes launched in the same checkout used to get wrong:

  resolve [--epic N]     exit 0 "LANE N — why"   — the lane this working tree serves
                         exit 2 "WRONG_TREE …"   — epic N has its own worktree (or this
                                                   worktree belongs to another epic)
                         exit 2 "AMBIGUOUS …"    — bare call, several candidates: pass --epic
  lock acquire --epic N  exit 0 "LOCKED …"       — this session now owns the working tree
                         exit 2 "BUSY …"         — another live session owns it
  lock release [--force] exit 0 "UNLOCKED …"     — drop this session's lock (--force: anyone's)
  lock status            exit 0 free or ours, exit 2 held by another session

`resolve` reads `git worktree list`: a worktree whose directory is named `lane-epic-N` is
epic N's lane, and that is the whole record — nothing to configure, and it disappears with
the worktree. `lock` keeps one file per working tree inside its git dir (`.git/` for the
primary checkout, `.git/worktrees/<name>/` for a worktree), so it is never tracked and
needs no .gitignore entry. The lock names the Claude Code session that holds it; a holder
whose transcripts have been silent for --stale-after seconds (default one hour) is presumed
dead and taken over, with a note. A holder with no transcript at all is not presumed
anything: BUSY, and the owner decides.

Any exit 1 is a parse or lookup error: the file is malformed, a key is unknown, a story is
not in sprint-status, git refused. That is deliberate — a gate that cannot be read is not
"open", and a tree that cannot be identified is not "free".

Where the two files live comes from `[paths]` in implement-next-story.toml at the repo
root (`--config` to point elsewhere), or from `--status-file` / `--gates-file`, which win
over the config. Neither given is an error, not a default: the skill refuses to guess a
project's layout. Paths in the config are relative to the repo root.

No PyYAML in the stdlib, so this carries a strict reader for exactly the shape documented
at the top of lane-gates.yaml (lists of flat mappings; `>-` / `|` block scalars). It rejects
anything else rather than guessing.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import subprocess
import sys
import time
import tomllib
from datetime import datetime, timezone

CONFIG_FILE = "implement-next-story.toml"
ADAPTER_TABLE = "adapter"

# The skill's board format (adapters/CONTRACT.md §3) — BMad writes it natively.
DEVELOPMENT_STATUS_KEY = "development_status"
STATUS_BACKLOG = "backlog"
STATUS_IN_PROGRESS = "in-progress"
STATUS_DONE = "done"

STORY_KEY = re.compile(r"^(\d+)-(\d+)-[a-z0-9-]+$")
EPIC_KEY = re.compile(r"^epic-(\d+)$")
LANE_WORKTREE = re.compile(r"^lane-epic-(\d+)$")

LOCK_FILE = "implement-next-story.lock"
STALE_AFTER = 60 * 60  # seconds a lock holder may be silent before it is presumed dead


class GateError(Exception):
    pass


# ------------------------------------------------------------------ readers

def _validate_adapter_table(path: str, doc: dict) -> None:
    adapter = doc.get(ADAPTER_TABLE)
    if not isinstance(adapter, dict):
        raise GateError(f"{path}: [{ADAPTER_TABLE}] needs exactly one of name / dir")
    has_name, has_dir = "name" in adapter, "dir" in adapter
    if has_name == has_dir:  # both or neither
        raise GateError(f"{path}: [{ADAPTER_TABLE}] needs exactly one of name / dir")
    key = "name" if has_name else "dir"
    if not isinstance(adapter[key], str):
        raise GateError(f"{path}: [{ADAPTER_TABLE}] {key} must be a string")


def read_config(root: str, explicit: str | None) -> dict:
    """The whole parsed config doc, or {} when no config exists and none was named.

    Validates `[paths]` (a table of strings) and `[adapter]` (exactly one of `name` /
    `dir`, a string) whenever a config file is actually read."""
    path = explicit or os.path.join(root, CONFIG_FILE)
    if explicit is None and not os.path.exists(path):
        return {}
    try:
        with open(path, "rb") as fh:
            doc = tomllib.load(fh)
    except OSError as exc:
        raise GateError(f"cannot read {path}: {exc}")
    except tomllib.TOMLDecodeError as exc:
        raise GateError(f"{path}: not valid TOML: {exc}")
    paths = doc.get("paths", {})
    if not isinstance(paths, dict) or not all(isinstance(v, str) for v in paths.values()):
        raise GateError(f"{path}: `[paths]` must be a table of strings")
    _validate_adapter_table(path, doc)
    return doc


def resolve_files(args, *keys: str) -> list[str]:
    """One path per key (`gates_file`, `status_file`) — flags win, then the config;
    nothing is guessed."""
    paths = read_config(args.root, args.config).get("paths", {})
    found = {key: getattr(args, key) or paths.get(key) for key in keys}
    missing = [key for key, value in found.items() if not value]
    if missing:
        raise GateError(f"no {' / '.join(missing)}: set it in {CONFIG_FILE} `[paths]` "
                        f"or pass --{missing[0].replace('_', '-')}")
    return [os.path.join(args.root, found[key]) for key in keys]


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
        if line.startswith(f"{DEVELOPMENT_STATUS_KEY}:"):
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
        raise GateError(f"{path}: no {DEVELOPMENT_STATUS_KEY} entries found")
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
        pending = sorted((k for k, v in stories.items() if v != STATUS_DONE),
                         key=lambda k: int(STORY_KEY.match(k).group(2)))
        if pending:
            return False, f"{len(pending)} of {len(stories)} {epic}-* stories not done (first: {pending[0]})"
        return True, f"every {epic}-* story done"
    if not STORY_KEY.match(req):
        raise GateError(f"`requires` must be a story key or epic-N, got {req!r}")
    if req not in status:
        raise GateError(f"gate requires {req}, which is not in sprint-status")
    return status[req] == STATUS_DONE, f"{req} is {status[req]}"


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
                  if EPIC_KEY.match(k) and v == STATUS_IN_PROGRESS)


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


def resolve_adapter_path(root: str, adapter: dict) -> tuple[str, str]:
    """(the adapter.md path `[adapter]` names, a description of the key that produced it)."""
    if "name" in adapter:
        name = adapter["name"]
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "adapters", name, "adapter.md")
        return path, f"[{ADAPTER_TABLE}] name = {name!r}"
    dir_ = adapter["dir"]
    path = os.path.join(root, dir_, "adapter.md")
    return path, f"[{ADAPTER_TABLE}] dir = {dir_!r}"


def cmd_adapter(args) -> int:
    doc = read_config(args.root, args.config)
    if not doc:
        path = args.config or os.path.join(args.root, CONFIG_FILE)
        raise GateError(f"{path}: no such file — set [{ADAPTER_TABLE}] name / dir there, "
                        f"or pass --config")
    path, key_desc = resolve_adapter_path(args.root, doc[ADAPTER_TABLE])
    if not os.path.isfile(path):
        print(f"ERROR: {os.path.abspath(path)}: no adapter.md there (from {key_desc})", file=sys.stderr)
        return 2
    print(os.path.abspath(path))
    return 0


# ------------------------------------------------------------------ trees and locks

def _git(root: str, *argv: str) -> str:
    try:
        done = subprocess.run(["git", "-C", root, *argv], capture_output=True, text=True, check=True)
    except FileNotFoundError:
        raise GateError("git is not on PATH")
    except subprocess.CalledProcessError as exc:
        raise GateError(f"git {' '.join(argv)}: {exc.stderr.strip() or exc}")
    return done.stdout


def this_tree(root: str) -> str:
    return os.path.realpath(_git(root, "rev-parse", "--show-toplevel").strip())


def worktrees(root: str) -> tuple[str, dict[int, str]]:
    """(primary checkout, {epic: path} for every worktree whose directory is lane-epic-N)."""
    paths = [line[len("worktree "):] for line in _git(root, "worktree", "list", "--porcelain").splitlines()
             if line.startswith("worktree ")]
    if not paths:
        raise GateError("`git worktree list` returned nothing")
    lanes: dict[int, str] = {}
    for path in paths[1:]:  # the first entry is always the primary checkout
        m = LANE_WORKTREE.match(os.path.basename(path.rstrip("/")))
        if not m:
            continue
        epic = int(m.group(1))
        if epic in lanes:
            raise GateError(f"two worktrees are named lane-epic-{epic}: {lanes[epic]} and {path}")
        lanes[epic] = os.path.realpath(path)
    return os.path.realpath(paths[0]), lanes


def cmd_resolve(args) -> int:
    primary, lanes = worktrees(args.root)
    here = this_tree(args.root)
    here_epic = next((e for e, p in lanes.items() if p == here), None)

    if here_epic is not None:
        if args.epic is not None and args.epic != here_epic:
            home = lanes.get(args.epic) or f"the primary checkout ({primary})"
            print(f"WRONG_TREE this is lane-epic-{here_epic}'s worktree; epic {args.epic} belongs in {home}")
            return 2
        print(f"LANE {here_epic} — this worktree is lane-epic-{here_epic} ({here})")
        return 0

    where = f"the primary checkout ({here})" if here == primary else f"worktree {here} (not a lane worktree)"
    if args.epic is not None:
        if args.epic in lanes:
            print(f"WRONG_TREE epic {args.epic} has a lane worktree at {lanes[args.epic]}; open the session there")
            return 2
        print(f"LANE {args.epic} — --epic given and no lane-epic-{args.epic} worktree exists, so it runs in {where}")
        return 0

    (status_path,) = resolve_files(args, "status_file")
    status = read_sprint_status(status_path)
    unhoused = [e for e in in_progress_epics(status) if e not in lanes]
    if len(unhoused) > 1:
        print(f"AMBIGUOUS epics {', '.join(map(str, unhoused))} are in progress and none has a "
              f"lane worktree — pass --epic N (and give one of them a worktree)")
        return 2
    if unhoused:
        print(f"LANE {unhoused[0]} — the only in-progress epic without a lane worktree, so it is {where}'s")
        return 0
    for key, state in status.items():
        if STORY_KEY.match(key) and state == STATUS_BACKLOG and epic_of(key) not in lanes:
            print(f"LANE {epic_of(key)} — no in-progress epic outside the lane worktrees; "
                  f"the first backlog story elsewhere is {key}")
            return 0
    housed = "; ".join(f"epic {e} → {p}" for e, p in sorted(lanes.items())) or "no backlog story left"
    print(f"NO_LANE nothing for {where}: {housed}")
    return 2


def lock_path(root: str) -> str:
    git_dir = _git(root, "rev-parse", "--git-dir").strip()
    return os.path.join(os.path.realpath(os.path.join(root, git_dir)), LOCK_FILE)


def read_lock(path: str) -> dict | None:
    try:
        with open(path) as fh:
            held = json.load(fh)
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as exc:
        raise GateError(f"unreadable lock {path}: {exc}")
    if not isinstance(held, dict) or "session" not in held:
        raise GateError(f"malformed lock {path}: {held!r}")
    return held


def write_lock(path: str, data: dict, exclusive: bool) -> None:
    payload = json.dumps(data, indent=2) + "\n"
    if exclusive:  # O_EXCL: two Step 0s racing for a free tree cannot both win
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
        with os.fdopen(fd, "w") as fh:
            fh.write(payload)
        return
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        fh.write(payload)
    os.replace(tmp, path)


def session_id() -> str | None:
    return os.environ.get("CLAUDE_CODE_SESSION_ID") or None


def last_activity(session: str) -> float | None:
    """Newest write to the session's transcript or any of its subagents' — None if no
    transcript exists for it (a session from another machine, or one already deleted)."""
    mains = glob.glob(os.path.expanduser(f"~/.claude/projects/*/{session}.jsonl"))
    files = list(mains)
    for main in mains:
        files += glob.glob(os.path.join(os.path.dirname(main), session, "subagents", "*.jsonl"))
    return max((os.path.getmtime(f) for f in files), default=None)


def _fmt_age(seconds: float) -> str:
    minutes = int(seconds // 60)
    return f"{minutes // 60}h{minutes % 60:02d}m" if minutes >= 60 else f"{minutes}m"


def describe_holder(held: dict) -> tuple[str, float | None]:
    """(one line naming the holder and its last activity, idle seconds or None)."""
    seen = last_activity(held["session"])
    idle = None if seen is None else max(0.0, time.time() - seen)
    story = f" story {held['story']}" if held.get("story") else ""
    activity = (f"last active {_fmt_age(idle)} ago" if idle is not None
                else "no transcript found for it — cannot tell whether it is alive")
    return (f"session {held['session']} for epic {held.get('epic')}{story} "
            f"since {held.get('acquired')} ({activity})"), idle


def cmd_lock_acquire(args) -> int:
    me = session_id()
    if not me:
        raise GateError("CLAUDE_CODE_SESSION_ID is not set — the lock needs a session to belong to")
    path = lock_path(args.root)
    note = ""
    for _attempt in (1, 2):
        held = read_lock(path)
        if held is None:
            data = {"epic": args.epic, "story": args.story, "session": me,
                    "acquired": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "tree": this_tree(args.root)}
            try:
                write_lock(path, data, exclusive=True)
            except FileExistsError:
                continue  # lost the race — read who won and judge them below
            print(f"LOCKED epic {args.epic} by session {me}{note} — {path}")
            return 0
        if held["session"] == me:
            held.update(epic=args.epic, story=args.story or held.get("story"))
            write_lock(path, held, exclusive=False)
            print(f"LOCKED epic {args.epic} by session {me} (re-entered) — {path}")
            return 0
        who, idle = describe_holder(held)
        if idle is None or idle < args.stale_after:
            print(f"BUSY {path}\n  held by {who}\n"
                  f"  another run owns this working tree: give one of the lanes its own worktree, "
                  f"or `lock release --force` if that session is gone")
            return 2
        note = f" — took over from session {held['session']}, silent for {_fmt_age(idle)}"
        os.remove(path)
    raise GateError(f"could not acquire {path}: it keeps changing under us")


def cmd_lock_release(args) -> int:
    path = lock_path(args.root)
    held = read_lock(path)
    if held is None:
        print(f"UNLOCKED (no lock) — {path}")
        return 0
    me = session_id()
    if held["session"] != me and not args.force:
        who, _ = describe_holder(held)
        print(f"BUSY {path}\n  held by {who}\n  not this session's lock: pass --force to remove it anyway")
        return 2
    os.remove(path)
    print(f"UNLOCKED {'(forced) ' if held['session'] != me else ''}— {path}")
    return 0


def cmd_lock_status(args) -> int:
    path = lock_path(args.root)
    held = read_lock(path)
    if held is None:
        print(f"FREE — {path}")
        return 0
    who, _ = describe_holder(held)
    mine = held["session"] == session_id()
    print(f"HELD {'(this session) ' if mine else ''}by {who} — {path}")
    return 0 if mine else 2


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", default=".", help="repo checkout to read (must be on main)")
    parser.add_argument("--config", help=f"project config (default: {CONFIG_FILE} under --root)")
    parser.add_argument("--gates-file", help="lane-gates.yaml, relative to --root (overrides the config)")
    parser.add_argument("--status-file", help="sprint-status.yaml, relative to --root (overrides the config)")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("check"); p.add_argument("story")
    p = sub.add_parser("analysed"); p.add_argument("--epic", type=int, required=True)
    sub.add_parser("list")
    sub.add_parser("adapter", help="resolve the adapter.md named in [adapter]")
    p = sub.add_parser("resolve", help="which lane this working tree serves")
    p.add_argument("--epic", type=int, help="the lane asked for; omitted = work it out from the tree and the board")
    p = sub.add_parser("lock", help="one-run-per-working-tree lock, kept in the git dir")
    lock = p.add_subparsers(dest="action", required=True)
    p = lock.add_parser("acquire"); p.add_argument("--epic", type=int, required=True)
    p.add_argument("--story", help="record the story key once Step 0 has chosen it")
    p.add_argument("--stale-after", type=int, default=STALE_AFTER, metavar="SECONDS",
                   help=f"take over a holder silent for this long (default {STALE_AFTER})")
    p = lock.add_parser("release"); p.add_argument("--force", action="store_true", help="remove another session's lock")
    lock.add_parser("status")
    args = parser.parse_args()
    try:
        if args.command == "adapter":
            return cmd_adapter(args)
        if args.command == "resolve":
            return cmd_resolve(args)
        if args.command == "lock":
            return {"acquire": cmd_lock_acquire, "release": cmd_lock_release, "status": cmd_lock_status}[args.action](args)
        gates_path, status_path = resolve_files(args, "gates_file", "status_file")
        doc = read_lane_gates(gates_path)
        status = read_sprint_status(status_path)
        return {"check": cmd_check, "analysed": cmd_analysed, "list": cmd_list}[args.command](args, doc, status)
    except GateError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
