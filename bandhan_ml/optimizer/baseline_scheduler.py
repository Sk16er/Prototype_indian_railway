"""
BANDHAN Optimizer — Stage 2: Baseline (Greedy) Scheduler

This is the deliberate "naive team" baseline: sort tasks by raw severity_grade
only (highest first) and assign each to the first available slot on its section,
ignoring gap-fit quality and duration uncertainty (uses historical duration_hours
as-is, no p90 sizing).

Purpose: provide a comparison lower-bound for Stage 6 evaluation.
We intentionally do NOT call any ML endpoints here — this is pure rule-based scheduling
exactly as a busy traffic controller might do manually.
"""

import os
import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

import time
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional, Dict

from bandhan_ml.optimizer.data_utils import (
    load_sections, load_timetable, load_pending_tasks,
    build_conflict_matrix, find_candidate_windows,
    slot_to_datetime, make_schedule_row, SCHEDULE_COLS,
    PLANNING_START, MIN_BLOCK_HRS, MAX_BLOCK_HRS,
    MAX_CREWS_PER_DEPT_PER_DAY,
)


def schedule_baseline(
    tasks_df: pd.DataFrame,
    sections_df: pd.DataFrame,
    timetable_df: pd.DataFrame,
    horizon_days: int = 7,
    base_date: datetime = PLANNING_START,
) -> pd.DataFrame:
    """
    Greedy baseline scheduler.

    Algorithm:
      1. Sort tasks by severity_grade descending (highest = most urgent).
      2. For each task, find candidate windows on its section (sorted by
         conflict level ascending — even the baseline needs a slot).
      3. Assign to the first candidate that does not violate crew limits.
      4. Mark the chosen slots as occupied so subsequent tasks don't overlap.

    No ML calls. No gap-fit optimization. No duration uncertainty.
    Uses historical duration_hours directly (no p90 buffer).
    """
    t0 = time.time()

    conflict_matrix = build_conflict_matrix(
        timetable_df, sections_df,
        horizon_days=horizon_days, base_date=base_date
    )

    # Occupied maintenance slots per section (separate from train conflict)
    # Shape: same as conflict_matrix arrays
    total_slots = horizon_days * 24
    occupied: Dict[str, np.ndarray] = {
        sec: np.zeros(total_slots, dtype=np.int32)
        for sec in sections_df["section_id"]
    }

    # Crew tracker: {dept: {day: count}}
    crew_usage: Dict[str, Dict[int, int]] = {}

    # Sort: severity_grade descending (naive baseline criterion)
    sorted_tasks = tasks_df.sort_values("severity_grade", ascending=False).reset_index(drop=True)

    rows = []
    unscheduled = []

    for _, task in sorted_tasks.iterrows():
        section_id = task["section_id"]
        dept = task.get("department", "Engineering")
        hist_dur = float(task.get("duration_hours", 4.0))
        # Clamp to [MIN_BLOCK_HRS, MAX_BLOCK_HRS]
        dur_hrs = max(MIN_BLOCK_HRS, min(MAX_BLOCK_HRS, hist_dur))
        required_slots = int(np.ceil(dur_hrs))

        candidates = find_candidate_windows(
            section_id=section_id,
            conflict_matrix=conflict_matrix,
            required_slots=required_slots,
            base_date=base_date,
            already_occupied=occupied,
            max_candidates=200,
        )

        placed = False
        for slot_idx, start_dt, conf_score in candidates:
            day_idx = slot_idx // 24
            # Check crew constraint
            if crew_usage.get(dept, {}).get(day_idx, 0) >= MAX_CREWS_PER_DEPT_PER_DAY:
                continue  # Crew exhausted for this dept on this day

            # Assign: mark slots as occupied
            for s in range(required_slots):
                if slot_idx + s < total_slots:
                    occupied[section_id][slot_idx + s] += 1

            # Update crew usage
            crew_usage.setdefault(dept, {})[day_idx] = crew_usage.get(dept, {}).get(day_idx, 0) + 1

            # gap_fit = 0.0 (baseline doesn't call M4, scored as 0 to penalize it in comparison)
            rows.append(make_schedule_row(
                task_row=task,
                slot_idx=slot_idx,
                duration_hrs=dur_hrs,
                gap_fit=0.0,     # Baseline: no gap-fit scoring
                priority=float(task["severity_grade"]) * 25.0,  # Proxy: grade*25 out of 100
                base_date=base_date,
                is_consolidated=False,
                consolidation_group="",
            ))
            placed = True
            break

        if not placed:
            unscheduled.append(task["defect_id"])

    solve_time = round(time.time() - t0, 3)
    schedule_df = pd.DataFrame(rows, columns=SCHEDULE_COLS) if rows else pd.DataFrame(columns=SCHEDULE_COLS)
    schedule_df.attrs["solve_time_seconds"] = solve_time
    schedule_df.attrs["unscheduled_tasks"]  = unscheduled
    schedule_df.attrs["method"] = "baseline"

    return schedule_df


def _count_possessions(schedule_df: pd.DataFrame) -> int:
    """Count unique section+day possession blocks."""
    if schedule_df.empty:
        return 0
    df = schedule_df.copy()
    df["day"] = pd.to_datetime(df["start_time"]).dt.date
    # Group by (section, day, department) — each group = one possession
    groups = df.groupby(["section_id", "day"]).size()
    return len(groups)


if __name__ == "__main__":
    print("=== STAGE 2: Baseline Scheduler ===\n")

    sections  = load_sections()
    timetable = load_timetable()
    tasks     = load_pending_tasks()

    print(f"Input: {len(tasks)} pending tasks across {tasks['section_id'].nunique()} sections\n")

    schedule = schedule_baseline(tasks, sections, timetable, horizon_days=7)

    print(f"Scheduled: {len(schedule)} / {len(tasks)} tasks")
    print(f"Unscheduled: {schedule.attrs.get('unscheduled_tasks', [])}")
    print(f"Solve time: {schedule.attrs.get('solve_time_seconds', 0):.3f}s")
    print(f"Possessions used: {_count_possessions(schedule)}")
    print()
    if not schedule.empty:
        print("Sample schedule output:")
        print(schedule[[
            "task_id", "section_id", "department", "severity_grade",
            "start_time", "duration_hours", "gap_fit_score"
        ]].to_string(index=False))
