"""
BANDHAN Operational Horizon Controller & 24-Hour Execution Lock Policy
Enforces rolling horizons:
- Monthly Strategic Plan (T-30d -> T-7d)
- Weekly Operational Schedule (T-7d -> T-24h)
- 24h Freeze Window Execution Lock (Override Gate: DRI >= 0.85)
"""

from datetime import datetime, timedelta
from typing import Any


def horizon_policy(horizon: str, now: datetime | None = None) -> dict[str, Any]:
    """Return operational horizon timing policy parameters."""
    now = now or datetime.now()
    horizon_clean = str(horizon).lower().strip()
    days = {"monthly": 30, "weekly": 7, "replanned": 7, "daily": 1}.get(horizon_clean, 7)

    start_boundary = now
    end_boundary = now + timedelta(days=days)
    freeze_at = now + timedelta(hours=24)

    return {
        "horizon": horizon_clean,
        "horizon_days": days,
        "freeze_window_hours": 24,
        "current_time": now.isoformat(),
        "freeze_until": freeze_at.isoformat(),
        "planning_window": {
            "start": start_boundary.isoformat(),
            "end": end_boundary.isoformat()
        },
        "freeze_lock_active": True,
        "emergency_override_gate": "DRI >= 0.85"
    }


def validate_freeze_window_modification(
    task_id: str,
    scheduled_start: datetime | str,
    dynamic_risk_index: float,
    now: datetime | None = None
) -> dict[str, Any]:
    """Check if task modification inside the 24-hour freeze window is allowed (DRI >= 0.85)."""
    now = now or datetime.now()

    if isinstance(scheduled_start, str):
        try:
            scheduled_dt = datetime.fromisoformat(scheduled_start.replace("Z", "+00:00"))
        except ValueError:
            scheduled_dt = now + timedelta(hours=12)
    else:
        scheduled_dt = scheduled_start

    hours_until_execution = (scheduled_dt - now).total_seconds() / 3600.0
    inside_freeze_window = 0 <= hours_until_execution <= 24.0

    dri = float(dynamic_risk_index)
    override_granted = dri >= 0.85

    if not inside_freeze_window:
        allowed = True
        status_reason = "Outside 24-hour freeze window. Normal operational planning allowed."
    else:
        if override_granted:
            allowed = True
            status_reason = f"Inside 24-hour freeze window. Emergency override GRANTED (DRI = {dri:.2f} >= 0.85)."
        else:
            allowed = False
            status_reason = f"Inside 24-hour freeze window. Modification BLOCKED (DRI = {dri:.2f} < 0.85 emergency threshold)."

    return {
        "task_id": str(task_id),
        "scheduled_start": scheduled_dt.isoformat(),
        "hours_until_execution": round(hours_until_execution, 2),
        "inside_freeze_window": inside_freeze_window,
        "dynamic_risk_index": round(dri, 4),
        "override_required": inside_freeze_window,
        "override_granted": override_granted if inside_freeze_window else True,
        "modification_allowed": allowed,
        "reason": status_reason
    }
