"""
BANDHAN ML - M4: Traffic Gap Miner (100k Dataset)
Analyzes section train traffic density, daily train count, and speed to calculate block gap fitness score.
"""

import os
import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from bandhan_ml.features.pipeline import load_split_data

_SECTION_TRAFFIC_CACHE = {}


def extract_headway_gaps(timetable_df: pd.DataFrame, setup_hours: float = 0.5, clearance_hours: float = 0.5) -> pd.DataFrame:
    """Extract consecutive-train gaps from dated or day/hour timetable rows."""
    if timetable_df is None or timetable_df.empty:
        return pd.DataFrame(columns=["section_id", "start_time", "end_time", "gap_hours", "goods_trains_before", "passenger_trains_before"])
    frame = timetable_df.copy()
    if "entry_time" in frame:
        frame["entry"] = pd.to_datetime(frame["entry_time"])
        frame["exit"] = pd.to_datetime(frame.get("exit_time", frame["entry_time"]))
    else:
        frame["entry"] = pd.Timestamp("2026-10-01") + pd.to_timedelta(frame.get("day_of_week", 0), unit="D") + pd.to_timedelta(frame.get("scheduled_hour", 0), unit="h")
        frame["exit"] = frame["entry"] + pd.to_timedelta(frame.get("occupancy_duration_mins", 30), unit="m")
    rows = []
    for section_id, group in frame.sort_values("entry").groupby("section_id"):
        group = group.sort_values("entry").reset_index(drop=True)
        for idx in range(len(group) - 1):
            current, following = group.iloc[idx], group.iloc[idx + 1]
            gap = max(0.0, (following.entry - current.exit).total_seconds() / 3600)
            rows.append({"section_id": section_id, "start_time": current.exit, "end_time": following.entry, "gap_hours": gap, "usable_hours": max(0.0, gap - setup_hours - clearance_hours), "goods_trains_before": int("Freight" in str(current.get("train_type", "")) or "Goods" in str(current.get("train_type", ""))), "passenger_trains_before": int("Passenger" in str(current.get("train_type", "")))})
    return pd.DataFrame(rows)


def feasible_headway_gaps(timetable_df: pd.DataFrame, p90_duration_hours: float, setup_hours: float = 0.5, clearance_hours: float = 0.5) -> pd.DataFrame:
    """Keep only gaps that can hold a p90-sized possession."""
    gaps = extract_headway_gaps(timetable_df, setup_hours, clearance_hours)
    return gaps[gaps["usable_hours"] >= float(p90_duration_hours)].reset_index(drop=True)

def get_section_traffic_map(data_dir: str = "bandhan_ml/Data_test") -> dict:
    global _SECTION_TRAFFIC_CACHE
    if "map" in _SECTION_TRAFFIC_CACHE:
        return _SECTION_TRAFFIC_CACHE["map"]
        
    df = load_split_data("train", data_dir=data_dir)
    sec_group = df.groupby("section_id").agg({
        "traffic_density": "mean",
        "daily_train_count": "mean",
        "passenger_train_count": "mean",
        "goods_train_count": "mean",
        "average_speed_kmph": "mean"
    }).to_dict(orient="index")
    
    _SECTION_TRAFFIC_CACHE["map"] = sec_group
    return sec_group

def gap_fit_score(
    section_id: str,
    start_time: str,
    duration_hours: float,
    data_dir: str = "bandhan_ml/Data_test"
) -> float:
    """
    Calculates gap-fit score (0.0 to 1.0) for a candidate maintenance window on a section.
    1.0 = completely open window (minimal traffic disruption)
    0.0 = saturated section during peak train movements
    """
    if isinstance(start_time, str):
        start_dt = pd.to_datetime(start_time)
    else:
        start_dt = start_time
        
    sec_map = get_section_traffic_map(data_dir=data_dir)
    sec_data = sec_map.get(section_id, {
        "traffic_density": 50.0,
        "daily_train_count": 40.0,
        "passenger_train_count": 25.0,
        "goods_train_count": 15.0,
        "average_speed_kmph": 80.0
    })
    
    # Base occupancy per hour derived from daily train count & speed
    daily_trains = sec_data["daily_train_count"]
    avg_speed = max(30.0, sec_data["average_speed_kmph"])
    density = sec_data["traffic_density"]
    
    # Hourly penalty factor based on start_time hour (night 01:00-05:00 has lower passenger train density)
    num_hours = int(np.ceil(duration_hours))
    hourly_penalties = []
    
    for h in range(num_hours):
        curr_hour = (start_dt + timedelta(hours=h)).hour
        if 1 <= curr_hour <= 5:  # Off-peak night window
            hour_factor = 0.35
        elif 7 <= curr_hour <= 10 or 17 <= curr_hour <= 20:  # Peak morning/evening passenger hours
            hour_factor = 1.00
        else:
            hour_factor = 0.65
            
        occ_ratio = min(1.0, (density / 100.0) * (daily_trains / 60.0) * hour_factor)
        hourly_penalties.append(occ_ratio)
        
    avg_penalty = np.mean(hourly_penalties)
    fit_score = max(0.0, min(1.0, 1.0 - avg_penalty))
    return round(float(fit_score), 4)

if __name__ == "__main__":
    s_night = gap_fit_score("SEC_0001", "2026-10-01 02:00:00", duration_hours=3.5)
    s_peak = gap_fit_score("SEC_0001", "2026-10-01 08:30:00", duration_hours=3.5)
    print("[STAGE 6: M4] Section Gap Fit Scores:")
    print(f"  - Night Possession Window (02:00 AM, 3.5 hrs): {s_night}")
    print(f"  - Peak Passenger Window  (08:30 AM, 3.5 hrs): {s_peak}")
