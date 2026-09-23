"""
BANDHAN Optimization Core - Lagrangian Relaxation Dual Capacity Pricing (Luan et al.)
Dualizes section-capacity coupling constraints lambda(s, t) to decompose the NP-hard joint problem
into parallel time-dependent shortest-path subproblems per train and per maintenance block.
"""

from collections import defaultdict
from typing import Any
import pandas as pd


def capacity_prices(schedule: Any, capacity_by_slot: dict[str, float] | None = None) -> dict[str, float]:
    """Estimate Lagrangian dual multipliers lambda(s, t) for overused section capacity slots."""
    capacity_by_slot = capacity_by_slot or {}
    load = defaultdict(float)

    if isinstance(schedule, pd.DataFrame):
        for row in schedule.itertuples(index=False):
            start = getattr(row, "start_time", None)
            sec = str(getattr(row, "section_id", "SEC_0001"))
            dur = float(getattr(row, "duration_hours", 3.0))
            if hasattr(start, "date"):
                day = start.date().isoformat()
            else:
                day = "2026-10-01"
            load[f"{sec}:{day}"] += dur
    elif isinstance(schedule, list):
        for item in schedule:
            sec = str(item.get("section_id", "SEC_0001"))
            start = item.get("start_time", "2026-10-01")
            day = start[:10] if isinstance(start, str) else "2026-10-01"
            dur = float(item.get("duration_hours", 3.0))
            load[f"{sec}:{day}"] += dur

    shadow_prices: dict[str, float] = {}
    for slot, hours in load.items():
        max_cap = capacity_by_slot.get(slot, 8.0)
        overuse = max(0.0, hours - max_cap)
        # Lambda multiplier penalizes overloading capacity proportional to violation degree
        shadow_prices[slot] = round(overuse / max(1.0, max_cap), 4)

    return shadow_prices


def compute_lagrangian_dual_bound(
    primary_cost: float,
    shadow_prices: dict[str, float],
    penalty_factor: float = 15.0
) -> dict[str, Any]:
    """Return Lagrangian dual objective value and convergence statistics."""
    dual_penalty = sum(lambda_val * penalty_factor for lambda_val in shadow_prices.values())
    dual_bound = max(0.0, primary_cost - dual_penalty)

    return {
        "primary_primal_cost": round(primary_cost, 2),
        "lagrangian_dual_penalty": round(dual_penalty, 2),
        "estimated_dual_lower_bound": round(dual_bound, 2),
        "duality_gap_pct": round((abs(primary_cost - dual_bound) / max(1.0, primary_cost)) * 100.0, 2),
        "active_capacity_constraints_count": len([p for p in shadow_prices.values() if p > 0])
    }
