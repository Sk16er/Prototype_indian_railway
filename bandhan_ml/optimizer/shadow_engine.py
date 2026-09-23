"""
BANDHAN Optimization Core - Multi-Department Shadow Engine
Groups Civil Engineering (TMS), Signal & Telecom (SMMS), and Electrical Traction (TDMS)
defects into consolidated mega-possessions, realizing the Budai & Dekker (~33%) time-saving bonus.
"""

from typing import Any
import pandas as pd


def detect_multi_department_shadows(tasks: pd.DataFrame) -> dict[str, Any]:
    """Identify tasks on the same section that can be co-located into a single joint possession."""
    if tasks is None or len(tasks) == 0:
        return {"consolidated_groups": [], "possessions_saved": 0, "total_hours_saved": 0.0, "consolidation_bonus_pct": 0.0}

    section_groups: dict[str, list[dict[str, Any]]] = {}
    for _, row in tasks.iterrows():
        item = row.to_dict() if hasattr(row, "to_dict") else dict(row)
        sec = str(item.get("section_id", "SEC_0001"))
        section_groups.setdefault(sec, []).append(item)

    consolidated_groups = []
    total_raw_hours = 0.0
    total_joint_hours = 0.0

    for section_id, task_list in section_groups.items():
        departments = {str(t.get("department", "Engineering")).upper() for t in task_list}
        raw_hours = sum(float(t.get("duration_hours", 3.0)) for t in task_list)
        total_raw_hours += raw_hours

        if len(task_list) > 1 and len(departments) >= 2:
            # Shared possession duration is max of individual durations + setup/teardown overhead (0.5h)
            max_duration = max(float(t.get("duration_hours", 3.0)) for t in task_list) + 0.5
            total_joint_hours += max_duration
            consolidated_groups.append({
                "section_id": section_id,
                "task_count": len(task_list),
                "task_ids": [str(t.get("task_id", t.get("defect_id", ""))) for t in task_list],
                "departments": list(departments),
                "raw_individual_hours": round(raw_hours, 2),
                "joint_possession_hours": round(max_duration, 2),
                "hours_saved": round(raw_hours - max_duration, 2),
                "has_traffic_isolation": "ENGINEERING" in departments,
                "has_power_isolation": "TRD" in departments or "ELECTRICAL" in departments,
                "has_st_disconnection": "S&T" in departments or "SIGNAL" in departments
            })
        else:
            total_joint_hours += raw_hours

    hours_saved = max(0.0, total_raw_hours - total_joint_hours)
    bonus_pct = (hours_saved / total_raw_hours * 100.0) if total_raw_hours > 0 else 0.0

    return {
        "consolidated_groups": consolidated_groups,
        "possessions_saved": len(consolidated_groups),
        "total_hours_saved": round(hours_saved, 2),
        "consolidation_bonus_pct": round(bonus_pct, 2)
    }


def group_multi_department_tasks(tasks: pd.DataFrame) -> dict[str, list[str]]:
    """Legacy interface mapping section IDs to multi-department task IDs."""
    shadow_result = detect_multi_department_shadows(tasks)
    return {g["section_id"]: g["task_ids"] for g in shadow_result["consolidated_groups"]}
