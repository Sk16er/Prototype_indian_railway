"""
BANDHAN Optimizer — Stage 3: Smart Constructive Heuristic Scheduler

Improvements over baseline:
  1. Ranks tasks by M3 priority score (not just severity grade).
  2. Sizes blocks using M2's p90_duration_hours + safety buffer (not raw historical hours).
  3. Picks slot via M4 gap-fit score (not just "first available").
  4. Detects coupling opportunities: tasks from different departments on the
     same section are merged into a single shared possession window.

This constructive heuristic is also used as the WARM START for Stage 4's MILP/ALNS.

Design note: We call the ML models directly (no HTTP) for speed. This is valid
because the optimizer and ML layer share the same Python environment. For the
live API demo, the scheduler_api (Stage 7) will call via HTTP instead.
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
from typing import Optional, Dict, List, Tuple

from bandhan_ml.optimizer.data_utils import (
    load_sections, load_timetable, load_pending_tasks,
    build_conflict_matrix, find_candidate_windows,
    score_priority_direct, predict_risk_direct, predict_duration_direct, score_gap_fit_direct,
    slot_to_datetime, make_schedule_row, SCHEDULE_COLS,
    PLANNING_START, MIN_BLOCK_HRS, MAX_BLOCK_HRS,
    MAX_CREWS_PER_DEPT_PER_DAY,
)

# Coupling parameters
COUPLING_WINDOW_HRS = 4.0    # Two tasks within 4h on same section = coupling candidate
COUPLING_BENEFIT    = 0.20   # Objective bonus for each merged possession


def _detect_coupling_groups(
    tasks_df: pd.DataFrame,
    scheduled_slots: Dict[str, int],   # task_id -> slot_idx
    scheduled_durs: Dict[str, float],  # task_id -> duration_hours
) -> Dict[str, str]:
    """
    After initial slot assignment, scan for tasks on the same section from
    DIFFERENT departments whose windows overlap or are within COUPLING_WINDOW_HRS.

    Returns: {task_id: group_id}  where group_id is a string like "GRP_SEC_12_001"
    """
    group_map: Dict[str, str] = {}
    group_counter = 0

    # Index tasks by section
    sec_tasks: Dict[str, List[str]] = {}
    for _, row in tasks_df.iterrows():
        tid = row["defect_id"]
        if tid not in scheduled_slots:
            continue
        sec = row["section_id"]
        sec_tasks.setdefault(sec, []).append(tid)

    for sec, tids in sec_tasks.items():
        if len(tids) < 2:
            continue

        # Build time intervals
        intervals = {}
        depts = {}
        for tid in tids:
            slot = scheduled_slots[tid]
            dur  = scheduled_durs[tid]
            intervals[tid] = (slot, slot + dur)
            depts[tid] = tasks_df[tasks_df["defect_id"] == tid]["department"].values[0]

        # Find pairs/groups that can share a possession
        merged = {}
        for i, tid_i in enumerate(tids):
            for j, tid_j in enumerate(tids):
                if j <= i:
                    continue
                if depts[tid_i] == depts[tid_j]:
                    continue  # Same department: no coupling bonus (but same possession)
                # Check overlap or proximity
                s_i, e_i = intervals[tid_i]
                s_j, e_j = intervals[tid_j]
                gap = max(0, max(s_i, s_j) - min(e_i, e_j))
                if gap <= COUPLING_WINDOW_HRS:
                    # Couple them
                    group_counter += 1
                    gid = f"GRP_{sec}_{group_counter:03d}"
                    merged.setdefault(tid_i, gid)
                    merged.setdefault(tid_j, gid)

        group_map.update(merged)

    return group_map


def schedule_greedy_smart(
    tasks_df: pd.DataFrame,
    sections_df: pd.DataFrame,
    timetable_df: pd.DataFrame,
    horizon_days: int = 7,
    base_date: datetime = PLANNING_START,
) -> pd.DataFrame:
    """
    Smart constructive heuristic scheduler.

    Algorithm:
      1. Score all tasks via M3 priority (escalation risk, severity, traffic, urgency, overdue).
      2. Sort highest-priority first.
      3. For each task:
         a. Get p90 duration from M2 (+ buffer) to size the block.
         b. Find candidate windows on the required section.
         c. Score each candidate with M4 gap-fit.
         d. Pick the candidate with highest gap-fit that respects crew limits.
      4. After all placements, detect and label coupling groups (multi-dept consolidation).
    """
    t0 = time.time()

    # --- Pre-compute priority scores (M3 direct call) ---
    tasks = tasks_df.copy()
    tasks["escalation_risk"] = tasks.get("escalation_risk", pd.Series([0.3] * len(tasks)))
    # Fill escalation_risk from severity as proxy (M1 not called here for speed;
    # in Stage 4 we can call M1 if needed)
    tasks["escalation_risk"] = [predict_risk_direct(row) for _, row in tasks.iterrows()]

    priorities = []
    for _, row in tasks.iterrows():
        p = score_priority_direct(row, sections_df)
        priorities.append(p)
    tasks["priority_score"] = priorities

    # Sort by priority descending
    tasks = tasks.sort_values("priority_score", ascending=False).reset_index(drop=True)

    # --- Build timetable conflict matrix ---
    conflict_matrix = build_conflict_matrix(
        timetable_df, sections_df,
        horizon_days=horizon_days, base_date=base_date
    )

    total_slots = horizon_days * 24
    occupied: Dict[str, np.ndarray] = {
        sec: np.zeros(total_slots, dtype=np.int32)
        for sec in sections_df["section_id"]
    }
    crew_usage: Dict[str, Dict[int, int]] = {}

    rows = []
    unscheduled = []
    scheduled_slots: Dict[str, int]   = {}
    scheduled_durs:  Dict[str, float] = {}

    for _, task in tasks.iterrows():
        section_id = task["section_id"]
        dept       = task.get("department", "Engineering")

        # M2: p90 duration sizing (key improvement over baseline)
        p50, p90, buf = predict_duration_direct(task)
        dur_hrs = max(MIN_BLOCK_HRS, min(MAX_BLOCK_HRS, p90 + buf))
        required_slots = int(np.ceil(dur_hrs))

        # Get candidate windows ranked by conflict level
        candidates = find_candidate_windows(
            section_id=section_id,
            conflict_matrix=conflict_matrix,
            required_slots=required_slots,
            base_date=base_date,
            already_occupied=occupied,
            max_candidates=100,
        )

        if not candidates:
            unscheduled.append(task["defect_id"])
            continue

        # M4: Score each candidate with gap-fit and pick the best
        # We evaluate the top-20 lowest-conflict candidates to balance quality vs speed
        best_slot, best_dt, best_gap = None, None, -1.0
        for slot_idx, start_dt, conf_score in candidates[:20]:
            day_idx = slot_idx // 24
            if crew_usage.get(dept, {}).get(day_idx, 0) >= MAX_CREWS_PER_DEPT_PER_DAY:
                continue
            gf = score_gap_fit_direct(section_id, start_dt, dur_hrs, sections_df)
            if gf > best_gap:
                best_gap  = gf
                best_slot = slot_idx
                best_dt   = start_dt

        if best_slot is None:
            unscheduled.append(task["defect_id"])
            continue

        # Mark slots as occupied
        for s in range(required_slots):
            if best_slot + s < total_slots:
                occupied[section_id][best_slot + s] += 1

        day_idx = best_slot // 24
        crew_usage.setdefault(dept, {})[day_idx] = crew_usage.get(dept, {}).get(day_idx, 0) + 1

        scheduled_slots[task["defect_id"]] = best_slot
        scheduled_durs[task["defect_id"]]  = dur_hrs

        rows.append(make_schedule_row(
            task_row=task,
            slot_idx=best_slot,
            duration_hrs=dur_hrs,
            gap_fit=best_gap,
            priority=float(task["priority_score"]),
            base_date=base_date,
            is_consolidated=False,
            consolidation_group="",
        ))

    # --- Multi-department coupling detection (post-placement) ---
    if rows:
        schedule_df = pd.DataFrame(rows, columns=SCHEDULE_COLS)
        coupling_groups = _detect_coupling_groups(tasks, scheduled_slots, scheduled_durs)

        if coupling_groups:
            schedule_df["is_consolidated"] = schedule_df["task_id"].isin(coupling_groups)
            schedule_df["consolidation_group"] = schedule_df["task_id"].map(coupling_groups).fillna("")
    else:
        schedule_df = pd.DataFrame(columns=SCHEDULE_COLS)

    solve_time = round(time.time() - t0, 3)
    schedule_df.attrs["solve_time_seconds"] = solve_time
    schedule_df.attrs["unscheduled_tasks"]  = unscheduled
    schedule_df.attrs["method"] = "greedy_smart"

    return schedule_df


def _count_possessions(schedule_df: pd.DataFrame) -> int:
    if schedule_df.empty:
        return 0
    df = schedule_df.copy()
    df["day"] = pd.to_datetime(df["start_time"]).dt.date
    return len(df.groupby(["section_id", "day"]))


def compare_with_baseline(smart_df: pd.DataFrame, baseline_df: pd.DataFrame) -> None:
    """Quick comparison print for Stage 3 verification."""
    print("\n--- Quick Comparison: Baseline vs Greedy Smart ---")
    print(f"{'Metric':<35} {'Baseline':>12} {'Greedy Smart':>14}")
    print("-" * 65)

    def _stats(df):
        n_tasks     = len(df)
        n_pos       = _count_possessions(df)
        avg_gap     = df["gap_fit_score"].mean() if not df.empty else 0.0
        hi_gap_pct  = (df["gap_fit_score"] > 0.15).mean() * 100 if not df.empty else 0.0
        consolidated = df["is_consolidated"].sum() if "is_consolidated" in df.columns else 0
        groups       = df["consolidation_group"].nunique() if "consolidation_group" in df.columns else 0
        block_hrs    = df["duration_hours"].sum() if not df.empty else 0.0
        t            = df.attrs.get("solve_time_seconds", 0.0)
        return n_tasks, n_pos, avg_gap, hi_gap_pct, consolidated, groups, block_hrs, t

    b = _stats(baseline_df)
    s = _stats(smart_df)

    metrics = [
        ("Tasks scheduled",        b[0],  s[0],  ""),
        ("Possessions used",        b[1],  s[1],  " ↓ better"),
        ("Avg gap-fit score",        b[2],  s[2],  " ↑ better"),
        ("% slots gap-fit > 0.15",  b[3],  s[3],  " ↑ better"),
        ("Tasks consolidated",      b[4],  s[4],  " ↑ better"),
        ("Consolidation groups",    b[5],  s[5],  " ↑ better"),
        ("Total block-hours",        b[6],  s[6],  ""),
        ("Solve time (s)",           b[7],  s[7],  ""),
    ]

    for label, bv, sv, note in metrics:
        bstr = f"{bv:.2f}" if isinstance(bv, float) else str(bv)
        sstr = f"{sv:.2f}" if isinstance(sv, float) else str(sv)
        print(f"  {label:<33} {bstr:>12} {sstr:>14}{note}")


if __name__ == "__main__":
    print("=== STAGE 3: Smart Greedy Scheduler ===\n")

    from bandhan_ml.optimizer.baseline_scheduler import schedule_baseline

    sections  = load_sections()
    timetable = load_timetable()
    tasks     = load_pending_tasks()

    print(f"Input: {len(tasks)} pending tasks\n")

    print("[Baseline]")
    baseline = schedule_baseline(tasks, sections, timetable, horizon_days=7)
    print(f"  Scheduled: {len(baseline)}/{len(tasks)} | Possessions: {_count_possessions(baseline)} | Time: {baseline.attrs['solve_time_seconds']:.3f}s")

    print("\n[Greedy Smart]")
    smart = schedule_greedy_smart(tasks, sections, timetable, horizon_days=7)
    print(f"  Scheduled: {len(smart)}/{len(tasks)} | Possessions: {_count_possessions(smart)} | Time: {smart.attrs['solve_time_seconds']:.3f}s")

    compare_with_baseline(smart, baseline)

    print("\nSmart schedule sample:")
    if not smart.empty:
        print(smart[[
            "task_id", "section_id", "department", "priority_score",
            "start_time", "duration_hours", "gap_fit_score", "is_consolidated", "consolidation_group"
        ]].sort_values("priority_score", ascending=False).to_string(index=False))
