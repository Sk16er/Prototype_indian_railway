"""M3 dynamic risk index with explicit, auditable components."""

from typing import Any


def dynamic_risk_index(row: Any, failure_risk: float | None = None) -> dict[str, float]:
    """Return bounded risk components and the composite DRI in [0, 1]."""
    getter = row.get if hasattr(row, "get") else lambda key, default=0: default
    failure = float(failure_risk if failure_risk is not None else getter("risk_score", 0.0))
    overdue = min(1.0, max(0.0, float(getter("overdue_days", 0.0)) / 90.0))
    tsr = min(1.0, max(0.0, float(getter("tsr_factor", getter("operational_impact", 0.0))) / 10.0))
    criticality = min(1.0, max(0.0, float(getter("asset_criticality", getter("severity_grade", 1))) / 4.0))
    dri = min(1.0, max(0.0, 0.55 * failure + 0.2 * overdue + 0.15 * tsr + 0.1 * criticality))
    return {"failure_risk": round(failure, 4), "overdue_component": round(overdue, 4),
            "tsr_component": round(tsr, 4), "criticality_component": round(criticality, 4),
            "dynamic_risk_index": round(dri, 4)}
