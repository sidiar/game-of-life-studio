#!/usr/bin/env python3
"""Phase timing + token accounting for the implement-next-story skill.

Two commands:

    story-run-stats.py mark <label>          record a phase boundary (now)
    story-run-stats.py report [--story-file F] [--write]

Marks are wall-clock boundaries written to a per-session state file. `report`
turns consecutive marks into phase windows, then attributes to each window:

  * every subagent transcript that STARTED inside it — including agents the
    phase agent spawned itself (bmad-code-review's three hunters land flat in
    the same session-level subagents/ dir), so a phase's cost is the whole
    subtree, not just the top agent;
  * the orchestrator's own assistant turns in that window.

Token counts come from each assistant message's `usage` block, so they are the
real billed numbers, not an estimate. Reading the transcripts this way keeps
them out of the orchestrator's context — only the aggregate is printed.

Time is reported two ways. *Wall clock* is mark-to-mark. *Active* is the same
window with idle gaps removed: every transcript entry (main session and every
subagent) carries a timestamp, so a stretch with no entries at all — a usage-limit
reset, the laptop asleep, the owner away — shows up as a gap in the event stream.
Any gap longer than `--idle-gap` minutes (default 15) is treated as idle and
excluded; the excluded gaps are listed under the table so the number is auditable.
The threshold sits well above the longest gap real work produces (a tool call or
CI poll, ≤ 10 min in every run so far) and well below the shortest pause worth
excluding (30+ min).
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from datetime import datetime, timezone

MARKER = ("This story was implemented with the 'Implement next story' skill "
          "with the following stats:")

IDLE_GAP_MINUTES = 15.0

# Ordered phase windows: (start mark, end mark, label)
PHASES = [
    ("step0", "step1", "Step 0 — re-entry guard"),
    ("step1", "step2", "Step 1 — create-story"),
    ("step2", "step3", "Step 2 — dev-story"),
    ("step3", "end", "Step 3 — code review + PR"),
]


# ---------------------------------------------------------------- state file

def state_path(explicit: str | None) -> str:
    if explicit:
        return explicit
    session = os.environ.get("CLAUDE_CODE_SESSION_ID", "unknown")
    tmp = os.environ.get("TMPDIR", "/tmp").rstrip("/")
    return f"{tmp}/implement-next-story-{session}.json"


def load_state(path: str) -> dict:
    try:
        with open(path) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {"marks": []}


def save_state(path: str, state: dict) -> None:
    with open(path, "w") as fh:
        json.dump(state, fh, indent=2)


# ------------------------------------------------------------- transcript IO

def session_dir() -> str | None:
    """~/.claude/projects/<slug>/ for the current session, or None."""
    session = os.environ.get("CLAUDE_CODE_SESSION_ID")
    if not session:
        return None
    hits = glob.glob(os.path.expanduser(f"~/.claude/projects/*/{session}.jsonl"))
    return os.path.dirname(hits[0]) if hits else None


def parse_ts(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def iter_entries(path: str):
    try:
        fh = open(path)
    except OSError:
        return
    with fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except ValueError:
                continue


ZERO = {"input": 0, "cache_write": 0, "cache_read": 0, "output": 0, "total": 0}


def add_usage(acc: dict, usage: dict) -> None:
    fields = {
        "input": usage.get("input_tokens", 0) or 0,
        "cache_write": usage.get("cache_creation_input_tokens", 0) or 0,
        "cache_read": usage.get("cache_read_input_tokens", 0) or 0,
        "output": usage.get("output_tokens", 0) or 0,
    }
    for key, value in fields.items():
        acc[key] += value
    acc["total"] += sum(fields.values())


def scan_transcript(path: str, window: tuple[float, float] | None = None) -> dict:
    """Totals for one transcript, optionally restricted to a time window."""
    tokens = dict(ZERO)
    per_model: dict[str, int] = {}
    first = last = None
    for entry in iter_entries(path):
        if entry.get("type") != "assistant":
            continue
        ts = parse_ts(entry.get("timestamp"))
        if window and ts is not None and not (window[0] <= ts <= window[1]):
            continue
        message = entry.get("message", {})
        model = message.get("model")
        if model in (None, "<synthetic>"):
            continue
        usage = message.get("usage") or {}
        add_usage(tokens, usage)
        per_model[model] = per_model.get(model, 0) + (usage.get("output_tokens", 0) or 0)
        if ts is not None:
            first = ts if first is None else min(first, ts)
            last = ts if last is None else max(last, ts)
    return {"tokens": tokens, "models": per_model, "first": first, "last": last}


def subagent_runs(sess_dir: str) -> list[dict]:
    session = os.environ.get("CLAUDE_CODE_SESSION_ID", "")
    runs = []
    for path in glob.glob(f"{sess_dir}/{session}/subagents/*.jsonl"):
        scanned = scan_transcript(path)
        if scanned["first"] is None:
            continue
        scanned["path"] = path
        runs.append(scanned)
    return sorted(runs, key=lambda r: r["first"])


# ------------------------------------------------------------- event stream

def event_times(paths: list[str]) -> list[float]:
    """Every timestamped entry across the given transcripts, sorted."""
    times = []
    for path in paths:
        for entry in iter_entries(path):
            ts = parse_ts(entry.get("timestamp"))
            if ts is not None:
                times.append(ts)
    return sorted(times)


def active_seconds(events: list[float], start: float, end: float,
                   idle_gap: float) -> tuple[float, list[tuple[float, float]]]:
    """Seconds inside [start, end] not covered by an idle gap.

    Consecutive events closer than `idle_gap` seconds are one stretch of work;
    a longer silence is idle and dropped. The window edges count as events so a
    phase that starts or ends mid-silence is handled the same way. Returns the
    active total and the excluded gaps as (gap start, gap length).
    """
    points = [start] + [t for t in events if start < t < end] + [end]
    active = 0.0
    idle: list[tuple[float, float]] = []
    for a, b in zip(points, points[1:]):
        gap = b - a
        if gap > idle_gap:
            idle.append((a, gap))
        else:
            active += gap
    return active, idle


# ----------------------------------------------------------------- rendering

def fmt_duration(seconds: float | None) -> str:
    if seconds is None:
        return "—"
    seconds = int(round(seconds))
    if seconds < 60:
        return f"{seconds}s"
    minutes, secs = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes}m {secs:02d}s"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes:02d}m"


def fmt_int(n: int) -> str:
    return f"{n:,}"


def model_label(per_model: dict[str, int]) -> str:
    if not per_model:
        return "—"
    ordered = sorted(per_model, key=lambda m: -per_model[m])
    pretty = [m.replace("claude-", "") for m in ordered]
    return ", ".join(pretty)


def build_report(state: dict, idle_gap_minutes: float = IDLE_GAP_MINUTES) -> tuple[str, dict]:
    marks = {m["label"]: m["epoch"] for m in state.get("marks", [])}
    sess_dir = session_dir()
    session = os.environ.get("CLAUDE_CODE_SESSION_ID", "")
    main_transcript = f"{sess_dir}/{session}.jsonl" if sess_dir else None
    runs = subagent_runs(sess_dir) if sess_dir else []
    idle_gap = idle_gap_minutes * 60
    events = event_times(([main_transcript] if main_transcript else [])
                         + [r["path"] for r in runs])

    rows = []
    totals = dict(ZERO)
    orch_totals = dict(ZERO)
    orch_models: dict[str, int] = {}

    for start_label, end_label, title in PHASES:
        start, end = marks.get(start_label), marks.get(end_label)
        if start is None:
            continue
        if end is None:
            end = max((m["epoch"] for m in state.get("marks", [])), default=start)
        window = (start, end)

        tokens = dict(ZERO)
        per_model: dict[str, int] = {}
        agents = 0
        for run in runs:
            if not (start <= run["first"] <= end):
                continue
            agents += 1
            for key in tokens:
                tokens[key] += run["tokens"][key]
            for model, out in run["models"].items():
                per_model[model] = per_model.get(model, 0) + out

        if main_transcript:
            orch = scan_transcript(main_transcript, window)
            for key in orch_totals:
                orch_totals[key] += orch["tokens"][key]
            for model, out in orch["models"].items():
                orch_models[model] = orch_models.get(model, 0) + out
            for key in tokens:
                tokens[key] += orch["tokens"][key]

        for key in totals:
            totals[key] += tokens[key]
        active, _ = active_seconds(events, start, end, idle_gap)
        rows.append({
            "title": title,
            "seconds": end - start,
            "active": active,
            "models": model_label(per_model),
            "agents": agents,
            "tokens": tokens,
        })

    first_mark = min(marks.values()) if marks else None
    last_mark = max(marks.values()) if marks else None
    wall = (last_mark - first_mark) if (first_mark and last_mark) else None
    total_active, idle = (active_seconds(events, first_mark, last_mark, idle_gap)
                          if wall is not None else (None, []))

    lines = [MARKER, ""]
    lines.append("| Phase | Agent model | Agents | Active | Wall clock | Input | Output | "
                 "Cache write | Cache read | Total tokens |")
    lines.append("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for row in rows:
        t = row["tokens"]
        lines.append(
            f"| {row['title']} | {row['models']} | {row['agents']} | "
            f"{fmt_duration(row['active'])} | {fmt_duration(row['seconds'])} | "
            f"{fmt_int(t['input'])} | "
            f"{fmt_int(t['output'])} | {fmt_int(t['cache_write'])} | "
            f"{fmt_int(t['cache_read'])} | {fmt_int(t['total'])} |"
        )
    lines.append(
        f"| _of which the orchestrator_ | {model_label(orch_models)} | — | — | — | "
        f"{fmt_int(orch_totals['input'])} | {fmt_int(orch_totals['output'])} | "
        f"{fmt_int(orch_totals['cache_write'])} | {fmt_int(orch_totals['cache_read'])} | "
        f"{fmt_int(orch_totals['total'])} |"
    )
    lines.append(
        f"| **Total (create-story → PR ready)** | | {sum(r['agents'] for r in rows)} | "
        f"**{fmt_duration(total_active)}** | {fmt_duration(wall)} | {fmt_int(totals['input'])} | "
        f"{fmt_int(totals['output'])} | {fmt_int(totals['cache_write'])} | "
        f"{fmt_int(totals['cache_read'])} | **{fmt_int(totals['total'])}** |"
    )
    lines.append("")
    if first_mark:
        started = datetime.fromtimestamp(first_mark, timezone.utc).astimezone()
        if idle:
            def when(at: float) -> str:      # date only when the gap starts on another day
                local = datetime.fromtimestamp(at, timezone.utc).astimezone()
                return f"{local:%H:%M}" if local.date() == started.date() else f"{local:%b %d %H:%M}"
            gaps = "; ".join(f"{fmt_duration(length)} from {when(at)}" for at, length in idle)
            idle_note = (f"Active excludes {len(idle)} idle gap{'s' if len(idle) > 1 else ''} "
                         f"totalling {fmt_duration(sum(g for _, g in idle))} ({gaps}) — "
                         "stretches with no transcript activity in the session or any "
                         "subagent, such as a usage-limit reset or the machine asleep. ")
        else:
            idle_note = "No idle gaps were excluded; Active and Wall clock agree. "
        lines.append(
            f"Run started {started:%Y-%m-%d %H:%M %Z}; wall clock runs to the point the run "
            f"stopped for the owner's review. {idle_note}"
            f"(A gap counts as idle above {idle_gap_minutes:g} min.) Each phase row covers "
            "the phase agent, any agents it spawned, and the orchestrator's own turns in that "
            "window — the orchestrator row breaks its share out again, it is not additional. "
            "Cache reads dominate the token totals and are billed at a fraction of input "
            "rate, so read the Input and Output columns for effort and the total only as a "
            "ceiling. The orchestrator's final turn is still being written when these numbers "
            "are taken.")

    return "\n".join(lines) + "\n", {"rows": rows, "totals": totals, "wall": wall,
                                     "active": total_active, "idle": idle}


def write_into_story(story_file: str, block: str) -> None:
    with open(story_file) as fh:
        text = fh.read()
    idx = text.find(MARKER)
    if idx != -1:
        text = text[:idx].rstrip("\n")
        if text.rstrip().endswith("---"):          # drop the separator we added last time
            text = text.rstrip()[: -len("---")]
    text = text.rstrip("\n") + "\n\n---\n\n" + block
    with open(story_file, "w") as fh:
        fh.write(text)


# --------------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["mark", "report"])
    parser.add_argument("label", nargs="?", help="mark label: step0|step1|step2|step3|end")
    parser.add_argument("--state", help="override the state file path")
    parser.add_argument("--story-file", help="story markdown to append the stats block to")
    parser.add_argument("--write", action="store_true",
                        help="with --story-file, write the block into the story")
    parser.add_argument("--idle-gap", type=float, default=IDLE_GAP_MINUTES, metavar="MINUTES",
                        help="a silence longer than this is idle, not work "
                             f"(default {IDLE_GAP_MINUTES:g})")
    args = parser.parse_args()

    path = state_path(args.state)

    if args.command == "mark":
        if not args.label:
            parser.error("mark requires a label")
        state = load_state(path)
        now = datetime.now(timezone.utc)
        state["marks"] = [m for m in state["marks"] if m["label"] != args.label]
        state["marks"].append({"label": args.label, "epoch": now.timestamp(),
                               "iso": now.isoformat()})
        state["marks"].sort(key=lambda m: m["epoch"])
        save_state(path, state)
        print(f"marked {args.label} at {now.astimezone():%H:%M:%S} ({path})")
        return 0

    state = load_state(path)
    if not state.get("marks"):
        print(f"no marks recorded in {path} — nothing to report", file=sys.stderr)
        return 1
    block, _ = build_report(state, args.idle_gap)
    print(block)
    if args.story_file and args.write:
        write_into_story(args.story_file, block)
        print(f"[written into {args.story_file}]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
