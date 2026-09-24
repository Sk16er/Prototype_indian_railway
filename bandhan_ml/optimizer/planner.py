"""
BANDHAN Optimizer — Stage 5: Rolling Multi-Horizon Planner

Provides two planning horizons and a disruption replanner:

1. Monthly plan: 30-day coarse schedule (daily slot resolution).
   Long-cycle tasks are placed first; results constrain the weekly plan.

2. Weekly plan: 7-day fine schedule against actual timetable.
   Derived by re-optimizing within each week of the monthly plan.

3. Disruption replanner: given an existing weekly plan + an injected event
   (defect burst or freight surge from scenario_knobs.py), re-run the optimizer
   ONLY on tasks/slots within ±24-48h of the disruption. Everything outside
   that window is frozen. Returns (new_plan, diff_df).

This is the "live demo disruption" moment: should run in a few seconds.
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
    PLANNING_START, SCHEDULE_COLS,
)
from bandhan_ml.optimizer.optimizer_core import schedule_optimized
from bandhan_ml.optimizer.smart_scheduler import _count_possessions
from bandhan_ml.data_gen.scenario_knobs import inject_defect_burst, inject_freight_surge


# ─── Monthly Plan ─────────────────────────────────────────────────────────────

def plan_monthly(
    tasks_df: pd.DataFrame,
    sections_df: pd.DataFrame,
    timetable_df: pd.DataFrame,
    base_date: datetime = PLANNING_START,
    horizon_days: int = 30,
    time_limit_s: int = 45,
) -> pd.DataFrame:
    """
    Produce a 30-day coarse maintenance plan.

    Strategy: Run the full optimizer on the complete 30-day horizon.
    Long-cycle tasks (severity 1-2, not overdue) are allowed to be placed
    anywhere in the 30-day window. High-priority tasks (severity 3-4 or overdue)
    are constrained to the first 7 days.

    Returns a DataFrame with the same schema as weekly schedule.
    """
    print(f"\n[Monthly Planner] Horizon: {horizon_days} days from {base_date.date()}")
    print(f"  Input: {len(tasks_df)} tasks")

    result = schedule_optimized(
        tasks_df, sections_df, timetable_df,
        horizon_days=horizon_days,
        base_date=base_date,
        time_limit_s=time_limit_s,
    )
    result.attrs["plan_type"] = "monthly"
    result.attrs["horizon_days"] = horizon_days
    print(f"  [Monthly] Scheduled: {len(result)}/{len(tasks_df)} | "
          f"Possessions: {_count_possessions(result)} | "
          f"Solve: {result.attrs.get('solve_time_seconds', 0):.1f}s")
    return result


def plan_weekly(
    tasks_df: pd.DataFrame,
    sections_df: pd.DataFrame,
    timetable_df: pd.DataFrame,
    week_start: datetime = PLANNING_START,
    monthly_plan: Optional[pd.DataFrame] = None,
    time_limit_s: int = 30,
) -> pd.DataFrame:
    """
    Produce a 7-day fine-grained schedule for the specified week.

    If a monthly_plan is provided, only tasks already assigned to this week's
    window are re-optimized (frozen tasks from other weeks are excluded).
    This creates the "weekly refinement within monthly envelope" behaviour.

    Without a monthly_plan, all pending tasks are scheduled in the 7-day window.
    """
    week_end = week_start + timedelta(days=7)
    print(f"\n[Weekly Planner] Week: {week_start.date()} -> {week_end.date()}")

    if monthly_plan is not None and not monthly_plan.empty:
        # Filter to tasks whose monthly plan start_time falls in this week
        mp = monthly_plan.copy()
        mp["start_time"] = pd.to_datetime(mp["start_time"])
        week_tasks_ids = mp[
            (mp["start_time"] >= week_start) &
            (mp["start_time"] < week_end)
        ]["task_id"].tolist()
        tasks_this_week = tasks_df[tasks_df["defect_id"].isin(week_tasks_ids)].copy()
        print(f"  Tasks from monthly plan assigned to this week: {len(tasks_this_week)}")
    else:
        tasks_this_week = tasks_df.copy()
        print(f"  Tasks (no monthly plan constraint): {len(tasks_this_week)}")

    if tasks_this_week.empty:
        print("  [Weekly] No tasks for this week.")
        return pd.DataFrame(columns=SCHEDULE_COLS)

    result = schedule_optimized(
        tasks_this_week, sections_df, timetable_df,
        horizon_days=7,
        base_date=week_start,
        time_limit_s=time_limit_s,
    )
    result.attrs["plan_type"] = "weekly"
    result.attrs["week_start"] = str(week_start.date())
    print(f"  [Weekly] Scheduled: {len(result)}/{len(tasks_this_week)} | "
          f"Possessions: {_count_possessions(result)} | "
          f"Solve: {result.attrs.get('solve_time_seconds', 0):.1f}s")
    return result


# ─── Disruption Replanner ─────────────────────────────────────────────────────

def replan_disruption(
    existing_plan: pd.DataFrame,
    existing_tasks: pd.DataFrame,
    sections_df: pd.DataFrame,
    timetable_df: pd.DataFrame,
    event_type: str = "defect_burst",         # "defect_burst" or "freight_surge"
    event_section: str = "SEC_01",
    event_time: Optional[datetime] = None,
    freeze_window_hrs: int = 48,              # Re-optimize ±48h around disruption
    num_new_defects: int = 8,                 # For defect_burst
    surge_factor: float = 1.4,               # For freight_surge
    time_limit_s: int = 20,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Disruption re-optimization for the live demo.

    1. Inject the event (defect burst or freight surge) using scenario_knobs.py.
    2. Identify affected tasks: those within ±freeze_window_hrs of the event time
       AND on the affected section(s).
    3. Freeze everything else (tasks outside the disruption window stay fixed).
    4. Re-run optimizer ONLY on affected tasks + new injected tasks.
    5. Return (new_plan, diff_df) where diff_df highlights what changed.

    This is designed to run in 2-5 seconds for the demo.
    """
    t0 = time.time()
    event_time = event_time or (PLANNING_START + timedelta(hours=12))
    print(f"\n[Disruption Replanner]")
    print(f"  Event: {event_type} on {event_section} at {event_time}")
    print(f"  Freeze window: ±{freeze_window_hrs}h around event")

    # ── Step 1: Inject event ──────────────────────────────────────────────
    defects_df = pd.read_csv(os.path.join(root_dir, "bandhan_ml/data/sample_defect_history_500.csv"))
    new_tasks = existing_tasks.copy()

    if event_type == "defect_burst":
        injected_defects = inject_defect_burst(
            defects_df, target_section=event_section, num_defects=num_new_defects
        )
        # Extract newly injected OPEN tasks
        new_open = injected_defects[
            (injected_defects["status"] == "OPEN") &
            (injected_defects["defect_id"].str.startswith("DEF_BURST"))
        ].copy()
        if not new_open.empty:
            from bandhan_ml.optimizer.data_utils import DEPT_MAP, SEVERITY_MAP
            new_open["department"] = new_open["asset_type"].map(DEPT_MAP).fillna("Engineering")
            new_open["severity_str"] = new_open["severity_grade"].map(SEVERITY_MAP).fillna("Medium")
            new_open["overdue_days"] = 0
            new_open["urgency"] = new_open["severity_grade"].map({1: 3.0, 2: 5.0, 3: 7.0, 4: 9.0}).fillna(5.0)
            new_tasks = pd.concat([new_tasks, new_open], ignore_index=True)
        injected_ids = list(new_open["defect_id"]) if not new_open.empty else []
        affected_sections = [event_section]

    elif event_type == "freight_surge":
        timetable_df = inject_freight_surge(timetable_df, surge_factor=surge_factor)
        injected_ids = []
        affected_sections = [event_section]
        new_tasks = existing_tasks.copy()

    else:
        raise ValueError(f"Unknown event_type: {event_type}")

    # ── Step 2: Identify affected tasks ──────────────────────────────────
    freeze_start = event_time - timedelta(hours=freeze_window_hrs)
    freeze_end   = event_time + timedelta(hours=freeze_window_hrs)

    existing_plan = existing_plan.copy()
    existing_plan["start_time"] = pd.to_datetime(existing_plan["start_time"])
    existing_plan["end_time"]   = pd.to_datetime(existing_plan["end_time"])

    # Frozen tasks: outside time window OR not on affected section
    is_affected = (
        (existing_plan["section_id"].isin(affected_sections)) &
        (existing_plan["start_time"] >= freeze_start) &
        (existing_plan["start_time"] <= freeze_end)
    )
    frozen_plan    = existing_plan[~is_affected].copy()
    affected_plan  = existing_plan[is_affected].copy()
    affected_ids   = set(affected_plan["task_id"].tolist()) | set(injected_ids)

    print(f"  Frozen tasks (unchanged): {len(frozen_plan)}")
    print(f"  Affected tasks (re-optimizing): {len(affected_ids)}")

    # ── Step 3: Re-optimize affected scope ───────────────────────────────
    tasks_to_replan = new_tasks[new_tasks["defect_id"].isin(affected_ids)].copy()

    if tasks_to_replan.empty:
        print("  [Replanner] No affected tasks — returning original plan unchanged.")
        return existing_plan, pd.DataFrame(columns=["task_id", "change_type", "old_start", "new_start"])

    new_partial = schedule_optimized(
        tasks_to_replan, sections_df, timetable_df,
        horizon_days=7,
        base_date=event_time.replace(hour=0, minute=0, second=0),
        time_limit_s=time_limit_s,
    )

    # ── Step 4: Merge frozen + replanned ─────────────────────────────────
    new_plan = pd.concat([frozen_plan, new_partial], ignore_index=True)
    new_plan = new_plan.sort_values("start_time").reset_index(drop=True)

    # ── Step 5: Build diff ───────────────────────────────────────────────
    diff_rows = []
    old_by_id = {r["task_id"]: r for _, r in affected_plan.iterrows()}
    new_by_id = {r["task_id"]: r for _, r in new_partial.iterrows()}

    for tid in affected_ids:
        old_row = old_by_id.get(tid)
        new_row = new_by_id.get(tid)
        if old_row is None and new_row is not None:
            diff_rows.append({"task_id": tid, "change_type": "ADDED",
                              "old_start": None, "new_start": new_row["start_time"]})
        elif old_row is not None and new_row is None:
            diff_rows.append({"task_id": tid, "change_type": "UNSCHEDULED",
                              "old_start": old_row["start_time"], "new_start": None})
        elif old_row is not None and new_row is not None:
            if str(old_row["start_time"]) != str(new_row["start_time"]):
                diff_rows.append({"task_id": tid, "change_type": "MOVED",
                                  "old_start": old_row["start_time"],
                                  "new_start": new_row["start_time"]})

    diff_df = pd.DataFrame(diff_rows)
    solve_time = round(time.time() - t0, 3)

    new_plan.attrs["plan_type"] = "replanned"
    new_plan.attrs["event_type"] = event_type
    new_plan.attrs["event_section"] = event_section
    new_plan.attrs["solve_time_seconds"] = solve_time

    print(f"  [Replanner] Done in {solve_time:.2f}s | "
          f"Plan: {len(new_plan)} tasks | Changes: {len(diff_df)}")
    return new_plan, diff_df


if __name__ == "__main__":
    print("=== STAGE 5: Rolling Multi-Horizon Planner ===\n")

    sections  = load_sections()
    timetable = load_timetable()
    tasks     = load_pending_tasks()

    # ── Monthly plan ──────────────────────────────────────────────────────
    print("=" * 60)
    print("MONTHLY PLAN (30 days)")
    monthly = plan_monthly(tasks, sections, timetable, time_limit_s=45)
    print(f"\nMonthly plan summary:")
    print(f"  Tasks scheduled: {len(monthly)}")
    print(f"  Possessions: {_count_possessions(monthly)}")
    print(f"  Avg gap-fit: {monthly['gap_fit_score'].mean():.4f}" if not monthly.empty else "  empty")

    # ── Weekly plan ───────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("WEEKLY PLAN (Week 1 of monthly)")
    weekly = plan_weekly(tasks, sections, timetable,
                         week_start=PLANNING_START,
                         monthly_plan=monthly)

    # ── Disruption replanner ──────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("DISRUPTION: Injecting defect burst into SEC_01...")
    new_plan, diff = replan_disruption(
        existing_plan=weekly,
        existing_tasks=tasks,
        sections_df=sections,
        timetable_df=timetable,
        event_type="defect_burst",
        event_section="SEC_01",
        event_time=PLANNING_START + timedelta(hours=12),
        num_new_defects=5,
        time_limit_s=15,
    )
    print(f"\nReplanned: {len(new_plan)} tasks total")
    if not diff.empty:
        print(f"Changes ({len(diff)} tasks):")
        print(diff.to_string(index=False))
    else:
        print("No changes in plan.")
