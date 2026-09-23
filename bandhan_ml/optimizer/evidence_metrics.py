"""Decision, fairness, robustness, and independent plan-verification metrics."""

from __future__ import annotations

from itertools import combinations
import numpy as np
import pandas as pd


def expected_deferral_cost(failure_probability: float, trains_affected: float, delay_minutes: float, safety_weight: float, overdue_days: float, overdue_growth: float = 0.02) -> float:
    consequence = max(0.0, trains_affected) * max(0.0, delay_minutes) * max(0.0, safety_weight)
    return float(max(0.0, failure_probability) * consequence + max(0.0, overdue_days) * overdue_growth)


def score_tasks_by_expected_cost(tasks: pd.DataFrame) -> pd.DataFrame:
    result = tasks.copy()
    result["expected_deferral_cost"] = [expected_deferral_cost(float(row.get("failure_probability", row.get("escalation_risk", 0))), float(row.get("trains_affected", 0)), float(row.get("delay_minutes", 0)), float(row.get("safety_weight", 1)), float(row.get("overdue_days", 0))) for _, row in result.iterrows()]
    return result.sort_values("expected_deferral_cost", ascending=False).reset_index(drop=True)


def jain_fairness(utilities: dict[str, float] | list[float]) -> float:
    values = np.asarray(list(utilities.values()) if isinstance(utilities, dict) else utilities, dtype=float)
    values = np.maximum(values, 0)
    return float((values.sum() ** 2) / (len(values) * np.square(values).sum())) if len(values) and np.square(values).sum() else 1.0


def nash_allocate_windows(utilities_by_window: dict[str, dict[str, float]], windows: list[str] | None = None) -> dict[str, str]:
    """Choose one window per department by maximizing the Nash utility product."""
    departments = sorted({department for utilities in utilities_by_window.values() for department in utilities})
    windows = windows or list(utilities_by_window)
    best, best_product = {}, -1.0
    for choices in __import__("itertools").product(windows, repeat=len(departments)):
        if len(set(choices)) != len(choices):
            continue
        allocation = dict(zip(departments, choices))
        product = float(np.prod([max(0.0, utilities_by_window[window].get(department, 0.0)) for department, window in allocation.items()]))
        if product > best_product:
            best, best_product = allocation, product
    return best


def verify_schedule(schedule: pd.DataFrame, sections: pd.DataFrame | None = None, max_hours: float = 8.0) -> dict:
    violations = []
    if schedule is None or schedule.empty:
        return {"violations": [], "violation_count": 0, "valid": True}
    frame = schedule.copy()
    frame["start"] = pd.to_datetime(frame["start_time"])
    frame["end"] = pd.to_datetime(frame.get("end_time", frame["start"] + pd.to_timedelta(frame["duration_hours"], unit="h")))
    for idx, row in frame.iterrows():
        if float(row.duration_hours) <= 0 or float(row.duration_hours) > max_hours:
            violations.append({"type": "duration_out_of_bounds", "task_id": str(row.get("task_id", idx))})
    for (_, section), left in frame.groupby([frame.section_id, frame.start.dt.date]):
        for i, j in combinations(left.index, 2):
            if left.loc[i, "start"] < left.loc[j, "end"] and left.loc[j, "start"] < left.loc[i, "end"]:
                violations.append({"type": "overlap", "section_id": str(section), "task_ids": [str(left.loc[i, "task_id"]), str(left.loc[j, "task_id"])]})
    return {"violations": violations, "violation_count": len(violations), "valid": not violations}


def p90_overrun_rate(actual: np.ndarray, planned: np.ndarray) -> float:
    return float(np.mean(np.asarray(actual) > np.asarray(planned))) if len(actual) else 0.0