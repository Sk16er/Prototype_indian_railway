"""
BANDHAN Optimizer — Stage 4: MILP / ALNS Optimization Core

Improves on the Stage 3 constructive heuristic with formal optimization.

Strategy:
  1. Try CP-SAT (OR-Tools) with the Stage 3 schedule as warm start.
     Time limit: 30 seconds. Returns best-found solution + optimality gap.
  2. If CP-SAT is unavailable or too slow for the instance, fall back to
     ALNS (Adaptive Large Neighborhood Search) with:
       - Destroy: random removal, worst-gap-fit removal
       - Repair: best-gap-fit reinsertion
       - Acceptance: simulated annealing (temperature schedule)

Design notes:
  - Warm-starting CP-SAT from a constructive heuristic is a well-established
    technique (Perron & Furnon, OR-Tools docs §Hints) that dramatically reduces
    solve time on scheduling problems. We encode the Stage 3 solution as hints.
  - ALNS over direct IP is chosen because the time-slot assignment structure
    means the LP relaxation is often weak; local search converges faster in practice.
  - We use 1-hour time slots (binary variables per slot per section per task),
    which keeps the model tractable for 7-day horizons with ~20-60 tasks.
"""

import os
import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

import time
import math
import random
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
from bandhan_ml.optimizer.evidence_metrics import verify_schedule
from bandhan_ml.optimizer.smart_scheduler import (
    schedule_greedy_smart, _detect_coupling_groups, _count_possessions,
)

# Objective weights (match optimizer_spec.md)
W_RISK   = 0.40
W_DELAY  = 0.30
W_FRAG   = 0.10
W_BONUS  = 0.20

# ALNS parameters
ALNS_MAX_ITER      = 500
ALNS_INIT_TEMP     = 5.0
ALNS_COOL_RATE     = 0.97
ALNS_REMOVE_FRAC   = 0.30   # Fraction of tasks to destroy per iteration


# ─── Objective function ───────────────────────────────────────────────────────

def compute_objective(
    placement: Dict[str, Tuple[int, float, float]],   # task_id -> (slot, dur, gap_fit)
    tasks_df: pd.DataFrame,
    sections_df: pd.DataFrame,
    conflict_matrix: Dict[str, np.ndarray],
) -> float:
    """
    Evaluate the objective function for a given placement.

    Objective (minimize):
      w_risk  * Σ unplaced tasks: risk_prob * severity_norm
    + w_delay * Σ placed tasks: (1 - gap_fit)          [delay cost]
    + w_frag  * total_possessions
    - w_bonus * coupling_count
    """
    placed_ids = set(placement.keys())
    all_ids    = set(tasks_df["defect_id"].tolist())
    unplaced   = all_ids - placed_ids

    # Risk exposure from unplaced tasks
    risk_cost = 0.0
    for tid in unplaced:
        row = tasks_df[tasks_df["defect_id"] == tid].iloc[0]
        risk  = float(row["severity_grade"]) / 4.0
        sev   = float(row["severity_grade"]) / 4.0
        risk_cost += risk * sev

    # Delay cost from placed tasks in poor windows
    delay_cost = sum(1.0 - gf for _, (_, _, gf) in placement.items())

    # Fragmentation (number of distinct possessions)
    # Each placed task that doesn't share a possession = 1 possession
    # Coupled tasks sharing same section+time = 1 possession for the group
    rows_temp = []
    for tid, (slot, dur, gf) in placement.items():
        row = tasks_df[tasks_df["defect_id"] == tid].iloc[0]
        start_dt = slot_to_datetime(slot)
        rows_temp.append({
            "task_id": tid, "section_id": row["section_id"],
            "start_time": start_dt, "duration_hours": dur,
            "department": row.get("department", "Engineering"),
        })
    temp_df = pd.DataFrame(rows_temp)
    frag_cost = _count_possessions_from_dict(rows_temp) if rows_temp else 0

    # Coupling bonus: tasks from different depts on same section within 4h
    coupling_groups = _detect_coupling_groups(
        tasks_df, {tid: s for tid, (s, _, _) in placement.items()},
        {tid: d for tid, (_, d, _) in placement.items()}
    )
    coupling_count = len(set(v for v in coupling_groups.values() if v))

    objective = (
        W_RISK  * risk_cost
      + W_DELAY * delay_cost
      + W_FRAG  * frag_cost
      - W_BONUS * coupling_count
    )
    return objective


def _count_possessions_from_dict(rows: list) -> int:
    if not rows:
        return 0
    df = pd.DataFrame(rows)
    df["day"] = pd.to_datetime(df["start_time"]).dt.date
    return len(df.groupby(["section_id", "day"]))


# ─── CP-SAT Optimizer ─────────────────────────────────────────────────────────

def _try_cpsat(
    tasks_df: pd.DataFrame,
    sections_df: pd.DataFrame,
    timetable_df: pd.DataFrame,
    warm_placement: Dict[str, Tuple[int, float, float]],
    conflict_matrix: Dict[str, np.ndarray],
    horizon_days: int,
    base_date: datetime,
    time_limit_s: int = 30,
) -> Tuple[Optional[Dict], float, float]:
    """
    Attempt to solve with OR-Tools CP-SAT.
    Returns (placement_dict, gap, solve_time) or (None, inf, solve_time) on failure.

    Model:
      Variables: start[i] in [0, total_slots-dur[i]]  (start slot for each task)
      Objective: minimize sum of conflict_score[start[i]] - coupling_bonus
      Constraints:
        - No two tasks on same section overlap (unless explicitly coupled)
        - Crew limit per dept per day
        - Duration covers p90+buffer

    We use IntervalVar + NoOverlap per section (CP-SAT's built-in global constraint)
    which is much faster than encoding slot-by-slot binary variables.
    """
    try:
        from ortools.sat.python import cp_model
    except ImportError:
        return None, float("inf"), 0.0

    t0 = time.time()
    model  = cp_model.CpModel()
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    solver.parameters.num_search_workers  = 4  # Parallel search

    total_slots = horizon_days * 24
    SCALE = 1000  # Scale floats to ints for CP-SAT

    tasks_list = tasks_df.reset_index(drop=True)
    n_tasks    = len(tasks_list)

    # --- Precompute durations and conflict arrays ---
    dur_slots  = []
    conf_arrays = []
    for _, row in tasks_list.iterrows():
        p50, p90, buf = predict_duration_direct(row)
        d = max(MIN_BLOCK_HRS, min(MAX_BLOCK_HRS, int(math.ceil(p90 + buf))))
        dur_slots.append(d)
        sec = row["section_id"]
        conf_arrays.append(conflict_matrix.get(sec, np.zeros(total_slots)).astype(float))

    # --- Decision variables ---
    # start[i] = start slot for task i (integer)
    starts   = []
    ends     = []
    intervals = []
    is_placed = []  # Optional[i]: 1 if task placed, 0 if skipped

    for i in range(n_tasks):
        dur = dur_slots[i]
        s   = model.NewIntVar(0, total_slots - dur, f"start_{i}")
        e   = model.NewIntVar(dur, total_slots, f"end_{i}")
        iv  = model.NewIntervalVar(s, dur, e, f"interval_{i}")
        opt = model.NewBoolVar(f"placed_{i}")
        starts.append(s)
        ends.append(e)
        intervals.append(iv)
        is_placed.append(opt)
        model.Add(e == s + dur)

    # --- Warm start hints from Stage 3 ---
    for i, row in tasks_list.iterrows():
        tid = row["defect_id"]
        if tid in warm_placement:
            ws = warm_placement[tid][0]  # warm start slot
            model.AddHint(starts[i], ws)
            model.AddHint(is_placed[i], 1)

    # --- Section non-overlap (NoOverlap per section) ---
    sec_intervals: Dict[str, List] = {}
    for i, row in tasks_list.iterrows():
        sec = row["section_id"]
        # Optional interval: only active if task is placed
        dur = dur_slots[i]
        opt_iv = model.NewOptionalIntervalVar(
            starts[i], dur, ends[i], is_placed[i], f"opt_interval_{i}"
        )
        sec_intervals.setdefault(sec, []).append(opt_iv)

    for sec, ivs in sec_intervals.items():
        if len(ivs) > 1:
            model.AddNoOverlap(ivs)

    # --- Crew constraint: max 3 tasks per dept per day ---
    for dept in tasks_df["department"].unique():
        dept_indices = [i for i, row in tasks_list.iterrows() if row.get("department") == dept]
        for day in range(horizon_days):
            day_start = day * 24
            day_end   = day_start + 24
            # Task i is "on day d" if its start slot falls in [day*24, (day+1)*24)
            on_day = []
            for i in dept_indices:
                in_day = model.NewBoolVar(f"in_day_{i}_{day}")
                model.Add(starts[i] >= day_start).OnlyEnforceIf(in_day)
                model.Add(starts[i] < day_end).OnlyEnforceIf(in_day)
                # combined: placed AND in this day
                both = model.NewBoolVar(f"placed_day_{i}_{day}")
                model.AddBoolAnd([is_placed[i], in_day]).OnlyEnforceIf(both)
                model.AddBoolOr([is_placed[i].Not(), in_day.Not()]).OnlyEnforceIf(both.Not())
                on_day.append(both)
            if on_day:
                model.Add(sum(on_day) <= MAX_CREWS_PER_DEPT_PER_DAY)

    # --- Objective ---
    # We approximate the objective using conflict_score at the warm-start slot
    # (linearizing the gap-fit lookup). For a full model we'd precompute all
    # slot costs and use element constraints — kept simple for demo speed.

    # Priority weights: higher priority tasks penalized more if unplaced
    priority_weights = []
    for _, row in tasks_list.iterrows():
        p = score_priority_direct(row, sections_df)
        priority_weights.append(int(p * SCALE))

    # Placement bonus (reward placing high-priority tasks)
    placement_terms = [
        priority_weights[i] * is_placed[i]
        for i in range(n_tasks)
    ]

    # Conflict penalty: precompute average conflict for warm-start slot
    # (static; a dynamic version would require element variables per task)
    conflict_terms = []
    for i in range(n_tasks):
        d = dur_slots[i]
        ws_slot = warm_placement.get(tasks_list.iloc[i]["defect_id"], (0,))[0]
        conf_arr = conf_arrays[i]
        avg_conf = float(np.mean(conf_arr[ws_slot:ws_slot + d])) if ws_slot + d <= len(conf_arr) else 0.5
        penalty = int(avg_conf * W_DELAY * SCALE)
        conflict_terms.append(penalty * is_placed[i])

    model.Maximize(
        sum(placement_terms) - sum(conflict_terms)
    )

    status = solver.Solve(model)
    solve_time = round(time.time() - t0, 3)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        placement = {}
        for i, row in tasks_list.iterrows():
            if solver.Value(is_placed[i]) == 1:
                slot = solver.Value(starts[i])
                dur  = dur_slots[i]
                sec  = row["section_id"]
                start_dt = slot_to_datetime(slot, base_date)
                gf = score_gap_fit_direct(sec, start_dt, float(dur), sections_df)
                placement[row["defect_id"]] = (slot, float(dur), gf)

        gap = solver.ObjectiveValue()  # For feasible: best found vs optimal bound
        best = solver.BestObjectiveBound()
        opt_gap = abs(gap - best) / (abs(gap) + 1e-9) if gap != 0 else 0.0
        return placement, round(opt_gap, 4), solve_time
    else:
        return None, float("inf"), solve_time


# ─── ALNS Fallback ────────────────────────────────────────────────────────────

def _alns_optimize(
    tasks_df: pd.DataFrame,
    sections_df: pd.DataFrame,
    conflict_matrix: Dict[str, np.ndarray],
    warm_placement: Dict[str, Tuple[int, float, float]],
    horizon_days: int,
    base_date: datetime,
    time_limit_s: int = 30,
) -> Tuple[Dict, int, float]:
    """
    ALNS (Adaptive Large Neighbourhood Search) optimizer.

    Destroy operators:
      D1: Random removal — remove ALNS_REMOVE_FRAC of placed tasks randomly
      D2: Worst-gap-fit removal — remove tasks with lowest gap-fit scores

    Repair operator:
      R1: Best-gap-fit reinsertion — for each removed task, find the window
          with the highest gap-fit score that satisfies constraints

    Acceptance: Simulated annealing (accepts worse solutions with P=exp(-Δ/T))

    Returns (best_placement, iterations_run, solve_time)
    """
    t0 = time.time()

    # Pre-compute durations
    dur_map = {}
    for _, row in tasks_df.iterrows():
        p50, p90, buf = predict_duration_direct(row)
        d = max(MIN_BLOCK_HRS, min(MAX_BLOCK_HRS, p90 + buf))
        dur_map[row["defect_id"]] = d

    total_slots = horizon_days * 24

    def make_occupied(placement):
        """Build occupied arrays from current placement."""
        occ = {s: np.zeros(total_slots, dtype=np.int32) for s in sections_df["section_id"]}
        for tid, (slot, dur, _) in placement.items():
            sec = tasks_df[tasks_df["defect_id"] == tid]["section_id"].values[0]
            d = int(math.ceil(dur))
            for s in range(d):
                if slot + s < total_slots:
                    occ[sec][slot + s] += 1
        return occ

    def repair_task(tid, placement, tasks_df):
        """Find best slot for task tid given current placement."""
        row = tasks_df[tasks_df["defect_id"] == tid].iloc[0]
        sec  = row["section_id"]
        dept = row.get("department", "Engineering")
        dur  = dur_map[tid]
        req_slots = int(math.ceil(dur))

        occ = make_occupied({k: v for k, v in placement.items() if k != tid})
        candidates = find_candidate_windows(
            section_id=sec,
            conflict_matrix=conflict_matrix,
            required_slots=req_slots,
            base_date=base_date,
            already_occupied=occ,
            max_candidates=30,
        )

        # Check crew constraint
        crew_day: Dict[str, Dict[int, int]] = {}
        for other_tid, (other_slot, other_dur, _) in placement.items():
            if other_tid == tid:
                continue
            other_row = tasks_df[tasks_df["defect_id"] == other_tid].iloc[0]
            other_dept = other_row.get("department", "Engineering")
            day = other_slot // 24
            crew_day.setdefault(other_dept, {})[day] = crew_day.get(other_dept, {}).get(day, 0) + 1

        best_slot, best_gf = None, -1.0
        for slot_idx, start_dt, conf in candidates[:15]:
            day = slot_idx // 24
            if crew_day.get(dept, {}).get(day, 0) >= MAX_CREWS_PER_DEPT_PER_DAY:
                continue
            gf = score_gap_fit_direct(sec, start_dt, dur, sections_df)
            if gf > best_gf:
                best_gf   = gf
                best_slot = slot_idx

        if best_slot is not None:
            return best_slot, dur, best_gf
        return None

    # Start from warm placement
    current = dict(warm_placement)
    current_obj = compute_objective(current, tasks_df, sections_df, conflict_matrix)
    best = dict(current)
    best_obj = current_obj

    temp = ALNS_INIT_TEMP
    iterations = 0
    rng = random.Random(42)

    while time.time() - t0 < time_limit_s:
        iterations += 1

        # ─ DESTROY ─
        placed_ids = list(current.keys())
        n_remove = max(1, int(len(placed_ids) * ALNS_REMOVE_FRAC))

        # Alternate between D1 (random) and D2 (worst gap-fit)
        if iterations % 2 == 0:
            # D1: random removal
            to_remove = rng.sample(placed_ids, min(n_remove, len(placed_ids)))
        else:
            # D2: worst gap-fit removal
            sorted_by_gf = sorted(placed_ids, key=lambda t: current[t][2])
            to_remove = sorted_by_gf[:n_remove]

        candidate = {k: v for k, v in current.items() if k not in to_remove}

        # ─ REPAIR ─
        rng.shuffle(to_remove)
        for tid in to_remove:
            result = repair_task(tid, candidate, tasks_df)
            if result is not None:
                candidate[tid] = result
            # If repair fails, task remains unplaced

        # ─ EVALUATE ─
        candidate_obj = compute_objective(candidate, tasks_df, sections_df, conflict_matrix)
        delta = candidate_obj - current_obj

        # ─ ACCEPT (simulated annealing) ─
        if delta < 0 or rng.random() < math.exp(-delta / (temp + 1e-9)):
            current = candidate
            current_obj = candidate_obj
            if current_obj < best_obj:
                best = dict(current)
                best_obj = current_obj

        temp *= ALNS_COOL_RATE

    solve_time = round(time.time() - t0, 3)
    return best, iterations, solve_time


# ─── Main Entry Point ─────────────────────────────────────────────────────────

def schedule_optimized(
    tasks_df: pd.DataFrame,
    sections_df: pd.DataFrame,
    timetable_df: pd.DataFrame,
    horizon_days: int = 7,
    base_date: datetime = PLANNING_START,
    time_limit_s: int = 30,
    use_alns: bool = False,   # Force ALNS (set True if CP-SAT too slow)
) -> pd.DataFrame:
    """
    Full optimization scheduler.

    Flow:
      1. Build warm start via schedule_greedy_smart (Stage 3).
      2. Try CP-SAT with warm start (30s limit). If successful, use result.
      3. If CP-SAT unavailable/fails, run ALNS from same warm start.
      4. Convert placement dict to schedule DataFrame.
    """
    t0 = time.time()

    # Stage 3 warm start
    print("  [optimized] Building warm start (Stage 3 greedy)...")
    warm_df = schedule_greedy_smart(tasks_df, sections_df, timetable_df, horizon_days, base_date)
    warm_placement: Dict[str, Tuple[int, float, float]] = {}
    for _, row in warm_df.iterrows():
        slot = int((pd.to_datetime(row["start_time"]) - base_date).total_seconds() / 3600)
        warm_placement[row["task_id"]] = (slot, float(row["duration_hours"]), float(row["gap_fit_score"]))

    conflict_matrix = build_conflict_matrix(
        timetable_df, sections_df, horizon_days=horizon_days, base_date=base_date
    )

    method_used = "unknown"
    opt_gap     = 0.0
    iterations  = 0

    if not use_alns:
        # Attempt CP-SAT
        print(f"  [optimized] Running CP-SAT (time limit: {time_limit_s}s)...")
        placement, opt_gap, cpsat_time = _try_cpsat(
            tasks_df, sections_df, timetable_df,
            warm_placement, conflict_matrix,
            horizon_days, base_date, time_limit_s
        )
        if placement is not None:
            method_used = "cpsat"
            print(f"  [optimized] CP-SAT found solution in {cpsat_time:.1f}s | gap={opt_gap:.4f}")
        else:
            print("  [optimized] CP-SAT unavailable/failed — falling back to ALNS")
            use_alns = True

    if use_alns:
        # ALNS fallback
        remaining_time = max(5, time_limit_s - int(time.time() - t0))
        print(f"  [optimized] Running ALNS ({remaining_time}s budget)...")
        placement, iterations, alns_time = _alns_optimize(
            tasks_df, sections_df, conflict_matrix,
            warm_placement, horizon_days, base_date, remaining_time
        )
        method_used = "alns"
        print(f"  [optimized] ALNS finished: {iterations} iterations in {alns_time:.1f}s")

    # Build schedule DataFrame from placement dict
    rows = []
    for _, task in tasks_df.iterrows():
        tid = task["defect_id"]
        if tid not in placement:
            continue
        slot, dur, gf = placement[tid]
        p50, p90, buf = predict_duration_direct(task)
        priority = score_priority_direct(task, sections_df)
        rows.append(make_schedule_row(
            task_row=task,
            slot_idx=slot,
            duration_hrs=dur,
            gap_fit=gf,
            priority=priority,
            base_date=base_date,
        ))

    schedule_df = pd.DataFrame(rows, columns=SCHEDULE_COLS) if rows else pd.DataFrame(columns=SCHEDULE_COLS)

    # Post-process: coupling detection
    if not schedule_df.empty:
        placed_slots = {r["task_id"]: placement[r["task_id"]][0] for _, r in schedule_df.iterrows()}
        placed_durs  = {r["task_id"]: placement[r["task_id"]][1] for _, r in schedule_df.iterrows()}
        coupling_groups = _detect_coupling_groups(tasks_df, placed_slots, placed_durs)
        if coupling_groups:
            schedule_df["is_consolidated"] = schedule_df["task_id"].isin(coupling_groups)
            schedule_df["consolidation_group"] = schedule_df["task_id"].map(coupling_groups).fillna("")

    unscheduled = [tid for tid in tasks_df["defect_id"] if tid not in placement]
    total_time  = round(time.time() - t0, 3)

    schedule_df.attrs["solve_time_seconds"] = total_time
    schedule_df.attrs["unscheduled_tasks"]  = unscheduled
    schedule_df.attrs["optimality_gap"]     = opt_gap
    schedule_df.attrs["method"]             = method_used
    schedule_df.attrs["alns_iterations"]    = iterations
    schedule_df.attrs["verification"]       = verify_schedule(schedule_df)

    return schedule_df


if __name__ == "__main__":
    print("=== STAGE 4: Optimized Scheduler ===\n")

    sections  = load_sections()
    timetable = load_timetable()
    tasks     = load_pending_tasks()

    print(f"Input: {len(tasks)} pending tasks\n")

    result = schedule_optimized(tasks, sections, timetable, horizon_days=7, time_limit_s=30)

    print(f"\nScheduled:      {len(result)} / {len(tasks)} tasks")
    print(f"Unscheduled:    {result.attrs.get('unscheduled_tasks', [])}")
    print(f"Method used:    {result.attrs.get('method', 'unknown')}")
    print(f"Solve time:     {result.attrs.get('solve_time_seconds', 0):.2f}s")
    print(f"Optimality gap: {result.attrs.get('optimality_gap', 'N/A')}")
    print(f"ALNS iterations:{result.attrs.get('alns_iterations', 0)}")
    print(f"Possessions:    {_count_possessions(result)}")
    print(f"Avg gap-fit:    {result['gap_fit_score'].mean():.4f}" if not result.empty else "N/A")
    print(f"Consolidated:   {result['is_consolidated'].sum() if not result.empty else 0}")

    if not result.empty:
        print("\nTop 10 by priority:")
        print(result[[
            "task_id", "section_id", "department", "priority_score",
            "start_time", "duration_hours", "gap_fit_score", "is_consolidated"
        ]].sort_values("priority_score", ascending=False).head(10).to_string(index=False))
