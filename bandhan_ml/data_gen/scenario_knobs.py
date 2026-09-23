"""
BANDHAN ML - Live Demo Scenario Knobs
Provides parameter adjustments to simulate real-world surges or emergency events.
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def inject_freight_surge(timetable_df: pd.DataFrame, surge_factor: float = 1.6, sections: list = None) -> pd.DataFrame:
    """
    Simulates a sudden surge in freight train movements (e.g. coal/steel corridor overload).
    """
    df_copy = timetable_df.copy()
    if sections:
        mask = df_copy["section_id"].isin(sections) & (df_copy["train_type"].str.contains("Freight"))
    else:
        mask = df_copy["train_type"].str.contains("Freight")
        
    freight_rows = df_copy[mask]
    num_to_add = int(len(freight_rows) * (surge_factor - 1.0))
    
    if num_to_add > 0:
        sampled = freight_rows.sample(n=num_to_add, replace=True)
        sampled["train_id"] = sampled["train_id"] + "_SURGE"
        sampled["scheduled_hour"] = np.random.randint(0, 24, size=num_to_add)
        df_copy = pd.concat([df_copy, sampled], ignore_index=True)
        
    print(f"[SCENARIO KNOB] Injected freight surge! Total train paths increased from {len(timetable_df)} to {len(df_copy)}")
    return df_copy

def inject_defect_burst(defects_df: pd.DataFrame, target_section: str = "SEC_01", num_defects: int = 25) -> pd.DataFrame:
    """
    Simulates a severe weather event or track anomaly causing a sudden spike in defects.
    """
    df_copy = defects_df.copy()
    section_defects = df_copy[df_copy["section_id"] == target_section]
    
    if len(section_defects) > 0:
        burst_samples = section_defects.sample(n=num_defects, replace=True)
        burst_samples["defect_id"] = [f"DEF_BURST_{i:04d}" for i in range(num_defects)]
        burst_samples["detected_date"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        burst_samples["status"] = "OPEN"
        burst_samples["resolved_date"] = None
        burst_samples["severity_grade"] = np.random.choice([3, 4], size=num_defects, p=[0.6, 0.4])
        burst_samples["escalated_to_critical_within_30d"] = 1
        
        df_copy = pd.concat([df_copy, burst_samples], ignore_index=True)
        
    print(f"[SCENARIO KNOB] Injected defect burst of {num_defects} Grade 3/4 defects into section '{target_section}'")
    return df_copy
