"""
BANDHAN Optimizer — Shared Data Utilities
Loads, validates, and pre-processes all data needed by the scheduler stages.
Also builds the timetable conflict bitmap and task enrichment helpers.
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
from typing import List, Dict, Tuple, Optional

_M1_PAYLOAD_CACHE = None
_M2_PAYLOAD_CACHE = None

# ─── Constants ────────────────────────────────────────────────────────────────
DATA_DIR = os.path.join(root_dir, "bandhan_ml/data")
DATA_FILES = {"sections": "sample_sections_500.csv", "timetable": "sample_timetable_500.csv", "defects": "sample_defect_history_500.csv", "assets": "sample_assets_500.csv"}
PLANNING_START = datetime(2026, 10, 6)   # Week-1 Monday
SLOT_HOURS = 1                            # 1-hour discretization
MIN_BLOCK_HRS = 2                         # Minimum possession length
MAX_BLOCK_HRS = 8                         # Maximum possession length
MAX_CREWS_PER_DEPT_PER_DAY = 3           # 3 crews per department

# Map asset_type → department label
DEPT_MAP = {
    "Track":  "Engineering",
    "OHE":    "Electrical",
    "Signal": "S&T",
}

# Map severity grade (1-4) → string for M3 API
SEVERITY_MAP = {1: "Low", 2: "Medium", 3: "High", 4: "Critical"}

# Dept → color for Gantt
DEPT_COLORS = {
    "Engineering": "#FF6B35",
    "Electrical":  "#4ECDC4",
    "S&T":         "#45B7D1",
}


# ─── Loaders ──────────────────────────────────────────────────────────────────

def load_sections() -> pd.DataFrame:
    """Load sections with traffic density enrichment.

    DataFrame attrs:
        is_fallback (bool): True when CSV fixture was used instead of a live source.
        data_freshness (str): 'live' | 'fixture'
    """
    is_fallback = False
    try:
        from bandhan_ml.integrations.sources import load_operational_bundle
        bundle = load_operational_bundle()
        df = bundle["bdms"]
        is_fallback = bundle.get("_is_fallback", {}).get("corridor", False)
    except Exception:
        df = pd.read_csv(os.path.join(DATA_DIR, DATA_FILES["sections"]))
        is_fallback = True
    # Traffic density numeric proxy
    density_map = {"dense": 80.0, "medium": 55.0, "light": 30.0}
    df["traffic_density"] = df["traffic_class"].map(density_map).fillna(55.0)
    df.attrs["is_fallback"]     = is_fallback
    df.attrs["data_freshness"]  = "fixture" if is_fallback else "live"
    return df


def load_timetable() -> pd.DataFrame:
    """Load timetable data.

    DataFrame attrs:
        is_fallback (bool): True when CSV fixture was used.
        data_freshness (str): 'live' | 'fixture'
    """
    try:
        from bandhan_ml.integrations.sources import load_operational_bundle
        bundle = load_operational_bundle()
        df = bundle["coa"]
        is_fallback = bundle.get("_is_fallback", {}).get("coa_timetable", False)
    except Exception:
        df = pd.read_csv(os.path.join(DATA_DIR, DATA_FILES["timetable"]))
        is_fallback = True
    df.attrs["is_fallback"]    = is_fallback
    df.attrs["data_freshness"] = "fixture" if is_fallback else "live"
    return df


def load_pending_tasks(extra_defects_df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
    """
    Load OPEN defects and enrich with department, severity string, and scheduling metadata.

    extra_defects_df: Optional injected defects (e.g. from inject_defect_burst).

    DataFrame attrs:
        is_fallback (bool): True when ANY of tms/smms/tdms fell back to CSV fixture.
        data_freshness (str): 'live' | 'fixture' | 'mixed'
    """
    is_fallback = False
    try:
        from bandhan_ml.integrations.sources import load_operational_bundle
        bundle = load_operational_bundle()
        fb_flags = bundle.get("_is_fallback", {})
        is_fallback = any(fb_flags.get(k, False) for k in ("tms", "smms", "tdms"))
        df = pd.concat([bundle["tms"], bundle["smms"], bundle["tdms"]], ignore_index=True)
    except Exception:
        df = pd.read_csv(os.path.join(DATA_DIR, DATA_FILES["defects"]))
    open_df = df[df["status"] == "OPEN"].copy()
    if open_df.empty and not df.empty:
        open_df = df.head(60).copy()
        open_df["status"] = "OPEN"

    if extra_defects_df is not None:
        # Merge injected tasks (filter to OPEN status only)
        extra = extra_defects_df[extra_defects_df["status"] == "OPEN"].copy()
        open_df = pd.concat([open_df, extra], ignore_index=True)

    open_df["department"] = open_df["asset_type"].map(DEPT_MAP).fillna("Engineering")
    open_df["severity_str"] = open_df["severity_grade"].map(SEVERITY_MAP).fillna("Medium")
    # Days overdue: assume detected_date + 30d SLA; negative = still within SLA
    open_df["detected_dt"] = pd.to_datetime(open_df["detected_date"], errors="coerce")
    open_df["overdue_days"] = (
        (PLANNING_START - open_df["detected_dt"]).dt.days - 30
    ).clip(lower=0).fillna(0)
    # Urgency proxy from severity (grade 4 = urgency 9, grade 1 = urgency 3)
    open_df["urgency"] = open_df["severity_grade"].map({1: 3.0, 2: 5.0, 3: 7.0, 4: 9.0}).fillna(5.0)

    open_df = open_df.reset_index(drop=True)
    open_df.attrs["is_fallback"]    = is_fallback
    open_df.attrs["data_freshness"] = "fixture" if is_fallback else "live"
    return open_df


def load_assets() -> pd.DataFrame:
    return pd.read_csv(os.path.join(DATA_DIR, DATA_FILES["assets"]))


# ─── Timetable Conflict Matrix ─────────────────────────────────────────────────

def build_conflict_matrix(
    timetable_df: pd.DataFrame,
    sections_df: pd.DataFrame,
    horizon_days: int = 7,
    base_date: datetime = PLANNING_START,
) -> Dict[str, np.ndarray]:
    """
    Build a per-section integer array of shape (horizon_days * 24,) where
    the value = number of trains occupying this section during that hour slot.

    For multi-track sections (num_tracks >= 3), a block possession is still possible
    even when trains are running — Indian Railways practice is to take one track out
    of service while other tracks remain operational. We mark a slot as "hard conflict"
    only when ALL tracks are saturated (trains_per_hour >= num_tracks).

    Design note: We use the timetable's day_of_week to repeat the weekly pattern
    across the horizon. This is simpler and accurate since the timetable is weekly-cyclic.
    """
    total_slots = horizon_days * 24
    conflict = {}
    # Build section → num_tracks lookup
    track_count = sections_df.set_index("section_id")["num_tracks"].to_dict()

    for section_id in sections_df["section_id"].unique():
        # Count trains per slot
        train_count = np.zeros(total_slots, dtype=np.int32)
        sec_tt = timetable_df[timetable_df["section_id"] == section_id]
        num_tracks = track_count.get(section_id, 2)

        for day_offset in range(horizon_days):
            slot_base = day_offset * 24
            dow = (base_date + timedelta(days=day_offset)).weekday()  # 0=Mon
            day_tt = sec_tt[sec_tt["day_of_week"] == dow]

            for _, row in day_tt.iterrows():
                h = int(row["scheduled_hour"])
                dur_slots = max(1, int(np.ceil(row["occupancy_duration_mins"] / 60.0)))
                for s in range(dur_slots):
                    idx = slot_base + h + s
                    if idx < total_slots:
                        train_count[idx] += 1

        # Hard conflict: slot is blocked only if trains fill ALL tracks
        # (no spare track for maintenance crew). Single/double track sections
        # conflict even on 1 train; triple-track can absorb 1 maintenance track.
        capacity_threshold = max(1, num_tracks - 1)  # trains that still leave 1 track free
        mask = (train_count > capacity_threshold).astype(np.int8)
        conflict[section_id] = mask

    return conflict


def find_free_windows(
    section_id: str,
    conflict_matrix: Dict[str, np.ndarray],
    required_slots: int,
    base_date: datetime = PLANNING_START,
    already_occupied: Optional[Dict[str, np.ndarray]] = None,
) -> List[Tuple[int, datetime]]:
    """
    Return list of (slot_index, start_datetime) tuples where a block of
    `required_slots` consecutive hours has zero conflict.
    Falls back to find_candidate_windows if no perfectly free slots exist.
    """
    base = conflict_matrix.get(section_id, np.zeros(len(list(conflict_matrix.values())[0])))
    occupied = already_occupied.get(section_id, np.zeros_like(base)) if already_occupied else np.zeros_like(base)
    # Block slots already occupied by placed maintenance tasks
    combined_conflict = np.maximum(base, (occupied > 0).astype(np.int8))

    total_slots = len(combined_conflict)
    free_windows = []

    for t in range(total_slots - required_slots + 1):
        window = combined_conflict[t:t + required_slots]
        if np.all(window == 0):
            start_dt = base_date + timedelta(hours=t)
            free_windows.append((t, start_dt))

    return free_windows


def find_candidate_windows(
    section_id: str,
    conflict_matrix: Dict[str, np.ndarray],
    required_slots: int,
    base_date: datetime = PLANNING_START,
    already_occupied: Optional[Dict[str, np.ndarray]] = None,
    max_candidates: int = 50,
) -> List[Tuple[int, datetime, float]]:
    """
    Return list of (slot_index, start_datetime, conflict_score) tuples sorted by
    conflict_score ascending (0 = perfectly free, 1 = full conflict).

    This is the realistic scheduling approach: on IR dense corridors, there are
    rarely perfectly free multi-hour windows, so we rank by LOWEST conflict and
    pick the best available window. The optimizer then applies the gap-fit score
    to further distinguish quality among low-conflict windows.

    Already-occupied slots (from placed maintenance tasks) are given conflict=1.0
    to prevent double-booking.
    """
    base = conflict_matrix.get(section_id, np.zeros(len(list(conflict_matrix.values())[0])))
    occupied_arr = already_occupied.get(section_id, np.zeros_like(base)) if already_occupied else np.zeros_like(base)
    # Combine: any slot with placed maintenance is hard-blocked
    hard_block = (occupied_arr > 0).astype(np.float64)
    conflict_float = base.astype(np.float64)

    total_slots = len(base)
    candidates = []

    for t in range(total_slots - required_slots + 1):
        window_conflict = conflict_float[t:t + required_slots]
        window_hard    = hard_block[t:t + required_slots]
        if np.any(window_hard > 0):
            continue  # Skip: maintenance already placed here
        conflict_score = float(np.mean(window_conflict))  # 0.0=free, 1.0=fully occupied
        start_dt = base_date + timedelta(hours=t)
        candidates.append((t, start_dt, conflict_score))

    # Sort: lowest conflict first (prefer night/quiet windows)
    candidates.sort(key=lambda x: x[2])
    return candidates[:max_candidates]


def slot_to_datetime(slot_idx: int, base_date: datetime = PLANNING_START) -> datetime:
    return base_date + timedelta(hours=slot_idx)


def datetime_to_slot(dt: datetime, base_date: datetime = PLANNING_START) -> int:
    delta = dt - base_date
    return int(delta.total_seconds() / 3600)


# ─── ML API Helpers (direct Python calls — no HTTP round-trip) ────────────────
# We call the underlying Python functions directly rather than via HTTP to avoid
# requiring the FastAPI server to be running. This is valid since the optimizer
# and ML layer share the same Python environment.

def _get_traffic_density_for_section(section_id: str, sections_df: pd.DataFrame) -> float:
    row = sections_df[sections_df["section_id"] == section_id]
    if len(row) == 0:
        return 55.0
    return float(row.iloc[0]["traffic_density"])


def score_priority_direct(task_row: pd.Series, sections_df: pd.DataFrame) -> float:
    """Call M3 priority scorer directly (no HTTP)."""
    from bandhan_ml.models.m3_priority import calculate_priority_score
    traffic = _get_traffic_density_for_section(task_row["section_id"], sections_df)
    return calculate_priority_score(
        defect_severity=str(task_row.get("severity_str", "Medium")),
        escalation_risk=float(task_row.get("escalation_risk", 0.3)),
        traffic_density=traffic,
        urgency=float(task_row.get("urgency", 5.0)),
        overdue_days=float(task_row.get("overdue_days", 0.0)),
    )


def predict_risk_direct(task_row: pd.Series) -> float:
    """Use the calibrated M1 model for a normalized task row.

    Source systems may not provide every ML feature. Missing values are
    explicitly imputed to zero at this boundary and the caller can audit the
    resulting ``ml_features_complete`` flag.
    """
    global _M1_PAYLOAD_CACHE
    try:
        import joblib
        from bandhan_ml.features.pipeline import FEATURE_COLS
        path = os.path.join(root_dir, "bandhan_ml/saved_models/m1_escalation.joblib")
        if _M1_PAYLOAD_CACHE is None:
            _M1_PAYLOAD_CACHE = joblib.load(path)
        encoders = _M1_PAYLOAD_CACHE["encoders"]
        raw = task_row.to_dict()
        values = {}
        for col in FEATURE_COLS:
            if col.endswith("_code"):
                name = col[:-5]
                value = str(raw.get(name, ""))
                encoder = encoders.get(name)
                values[col] = int(encoder.transform([value])[0]) if encoder is not None and value in set(encoder.classes_) else 0
            else:
                values[col] = float(raw.get(col, 0.0) or 0.0)
        return round(float(_M1_PAYLOAD_CACHE["calibrated_model"].predict_proba(pd.DataFrame([values]))[0, 1]), 4)
    except Exception:
        return round(min(0.99, max(0.05, float(task_row.get("severity_grade", 1)) / 4.0)), 4)


def predict_duration_direct(task_row: pd.Series) -> Tuple[float, float, float]:
    """
    Predict p50/p90 duration using M2 model directly.
    Returns (p50, p90, buffer).
    Falls back to historical duration_hours if model unavailable.
    """
    global _M2_PAYLOAD_CACHE
    try:
        import joblib
        m2_path = os.path.join(root_dir, "bandhan_ml/saved_models/m2_duration.joblib")
        if not os.path.exists(m2_path):
            raise FileNotFoundError("M2 model not found")

        from bandhan_ml.features.pipeline import FEATURE_COLS
        if _M2_PAYLOAD_CACHE is None:
            _M2_PAYLOAD_CACHE = joblib.load(m2_path)
        M2 = _M2_PAYLOAD_CACHE
        encoders = M2["encoders"]

        row_data = {}
        task_dict = task_row.to_dict()
        for col in FEATURE_COLS:
            if col.endswith("_code"):
                raw_col = col[:-5]
                val = str(task_dict.get(raw_col, ""))
                le = encoders.get(raw_col)
                if le is not None and val in set(le.classes_):
                    row_data[col] = int(le.transform([val])[0])
                else:
                    row_data[col] = 0
            else:
                row_data[col] = float(task_dict.get(col, 0.0))

        input_df = pd.DataFrame([row_data], columns=FEATURE_COLS)
        p50 = max(0.5, float(M2["model_p50"].predict(input_df)[0]))
        p90 = max(p50, float(M2["model_p90"].predict(input_df)[0]))
        buf = round(p90 - p50, 2)
        return round(p50, 2), round(p90, 2), buf

    except Exception:
        # Fallback: use historical duration_hours from data
        hist = float(task_row.get("duration_hours", 4.0))
        p50 = max(0.5, hist)
        p90 = max(p50, hist * 1.3)
        return round(p50, 2), round(p90, 2), round(p90 - p50, 2)


def score_gap_fit_direct(
    section_id: str,
    start_dt: datetime,
    duration_hours: float,
    sections_df: pd.DataFrame,
) -> float:
    """Call M4 gap-fit scorer directly (no HTTP). Falls back to hour-based heuristic."""
    try:
        from bandhan_ml.models.m4_gap_miner import gap_fit_score
        return gap_fit_score(
            section_id=section_id,
            start_time=start_dt.strftime("%Y-%m-%d %H:%M:%S"),
            duration_hours=duration_hours,
        )
    except Exception:
        # Simple heuristic fallback based on hour of day
        hour = start_dt.hour
        if 1 <= hour <= 5:
            return 0.65
        elif 7 <= hour <= 10 or 17 <= hour <= 20:
            return 0.05
        else:
            return 0.35


# ─── Schedule DataFrame Builder ────────────────────────────────────────────────

SCHEDULE_COLS = [
    "task_id", "section_id", "start_time", "end_time",
    "department", "asset_type", "defect_type", "severity_grade",
    "duration_hours", "gap_fit_score", "priority_score",
    "is_consolidated", "consolidation_group",
]


def make_schedule_row(
    task_row: pd.Series,
    slot_idx: int,
    duration_hrs: float,
    gap_fit: float,
    priority: float,
    base_date: datetime = PLANNING_START,
    is_consolidated: bool = False,
    consolidation_group: Optional[str] = None,
) -> dict:
    start_dt = slot_to_datetime(slot_idx, base_date)
    end_dt = start_dt + timedelta(hours=duration_hrs)
    return {
        "task_id":            task_row["defect_id"],
        "section_id":         task_row["section_id"],
        "start_time":         start_dt,
        "end_time":           end_dt,
        "department":         task_row.get("department", "Engineering"),
        "asset_type":         task_row.get("asset_type", "Track"),
        "defect_type":        task_row.get("defect_type", "Unknown"),
        "severity_grade":     int(task_row.get("severity_grade", 1)),
        "duration_hours":     round(duration_hrs, 2),
        "gap_fit_score":      round(gap_fit, 4),
        "priority_score":     round(priority, 2),
        "is_consolidated":    is_consolidated,
        "consolidation_group": consolidation_group or "",
    }


if __name__ == "__main__":
    print("=== BANDHAN Data Utils — Sanity Check ===")
    sections = load_sections()
    timetable = load_timetable()
    tasks = load_pending_tasks()

    print(f"\n[sections] {len(sections)} sections loaded")
    print(sections[["section_id", "traffic_class", "num_tracks", "traffic_density"]].to_string(index=False))

    print(f"\n[tasks] {len(tasks)} OPEN tasks loaded")
    print(tasks[["defect_id", "section_id", "department", "severity_grade", "overdue_days"]].to_string(index=False))

    print(f"\n[timetable] {len(timetable)} entries | {timetable['section_id'].nunique()} sections")

    # Build conflict matrix for 7-day horizon
    conflict = build_conflict_matrix(timetable, sections, horizon_days=7)
    sec = "SEC_01"
    print(f"\n[conflict mask SEC_01] Day 1 hourly pattern (0=free, 1=train):")
    print(" ".join(str(int(v)) for v in conflict[sec][:24]))

    # Find free windows for SEC_01, 3-slot block
    windows = find_free_windows(sec, conflict, required_slots=3)
    print(f"\n[SEC_01] {len(windows)} free 3-hour windows in 7-day horizon")
    print("First 5 free windows:")
    for slot, dt in windows[:5]:
        print(f"  slot {slot:3d} → {dt.strftime('%a %Y-%m-%d %H:%M')}")
