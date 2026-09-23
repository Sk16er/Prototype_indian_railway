"""
BANDHAN ML - M3: Criticality / Priority Score (100k Dataset)
Calculates normalized maintenance priority score (0-100) combining defect severity,
M1 predicted escalation risk, section traffic density, urgency, and overdue days.
"""

import os
import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

import yaml
import pandas as pd
import numpy as np

DEFAULT_CONFIG_PATH = os.path.join(root_dir, "bandhan_ml/config/default_config.yaml")

def load_config(config_path: str = DEFAULT_CONFIG_PATH) -> dict:
    if os.path.exists(config_path):
        with open(config_path, "r") as f:
            return yaml.safe_load(f)
    return {
        "m3_priority_weights": {
            "w_severity": 0.30,
            "w_escalation_risk": 0.35,
            "w_traffic_density": 0.15,
            "w_urgency_deadline": 0.10,
            "w_days_overdue": 0.10
        }
    }

def calculate_priority_score(
    defect_severity: str,
    escalation_risk: float,
    traffic_density: float,
    urgency: float,
    overdue_days: float,
    weights_override: dict = None,
    config_path: str = DEFAULT_CONFIG_PATH
) -> float:
    """
    Computes priority score normalized to [0, 100].
    """
    if weights_override:
        weights = weights_override
    else:
        cfg = load_config(config_path)
        weights = cfg.get("m3_priority_weights", {})
        
    w1 = weights.get("w_severity", 0.30)
    w2 = weights.get("w_escalation_risk", 0.35)
    w3 = weights.get("w_traffic_density", 0.15)
    w4 = weights.get("w_urgency_deadline", 0.10)
    w5 = weights.get("w_days_overdue", 0.10)
    
    # Severity norm
    sev_str = str(defect_severity).upper()
    sev_map = {"LOW": 0.25, "MEDIUM": 0.50, "HIGH": 0.75, "CRITICAL": 1.00}
    sev_norm = sev_map.get(sev_str, 0.50)
    
    # Escalation risk norm [0, 1]
    esc_norm = min(1.0, max(0.0, float(escalation_risk)))
    
    # Traffic density norm [0, 100] -> [0, 1]
    traffic_norm = min(1.0, max(0.0, float(traffic_density) / 100.0))
    
    # Urgency norm [1, 10] -> [0.1, 1.0]
    urgency_norm = min(1.0, max(0.1, float(urgency) / 10.0))
    
    # Overdue days norm [0, 120] -> [0, 1]
    overdue_norm = min(1.0, max(0.0, float(overdue_days) / 120.0))
    
    raw_score = (
        w1 * sev_norm +
        w2 * esc_norm +
        w3 * traffic_norm +
        w4 * urgency_norm +
        w5 * overdue_norm
    )
    
    total_w = w1 + w2 + w3 + w4 + w5
    final_score = (raw_score / total_w) * 100.0
    return round(float(final_score), 2)

def rank_maintenance_tasks(tasks_df: pd.DataFrame, weights_override: dict = None) -> pd.DataFrame:
    df = tasks_df.copy()
    scores = []
    for _, row in df.iterrows():
        s = calculate_priority_score(
            defect_severity=str(row.get("defect_severity", "Medium")),
            escalation_risk=float(row.get("escalation_risk", 0.2)),
            traffic_density=float(row.get("traffic_density", 50.0)),
            urgency=float(row.get("urgency", 5.0)),
            overdue_days=float(row.get("overdue_days", 0.0)),
            weights_override=weights_override
        )
        scores.append(s)
        
    df["priority_score"] = scores
    df = df.sort_values("priority_score", ascending=False).reset_index(drop=True)
    df["rank"] = range(1, len(df) + 1)
    return df

if __name__ == "__main__":
    sample_df = pd.DataFrame([
        {"maintenance_id": "MNT_001", "defect_severity": "Critical", "escalation_risk": 0.88, "traffic_density": 85.0, "urgency": 9.2, "overdue_days": 15},
        {"maintenance_id": "MNT_002", "defect_severity": "Low", "escalation_risk": 0.05, "traffic_density": 30.0, "urgency": 2.1, "overdue_days": 0},
        {"maintenance_id": "MNT_003", "defect_severity": "High", "escalation_risk": 0.62, "traffic_density": 92.0, "urgency": 7.5, "overdue_days": 5},
    ])
    ranked = rank_maintenance_tasks(sample_df)
    print("[STAGE 5: M3] Priority Scorer Sample Ranking:")
    for _, r in ranked.iterrows():
        print(f"  - Rank {r['rank']}: {r['maintenance_id']} -> Priority Score: {r['priority_score']}")
