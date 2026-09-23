"""
Stage 7: REST API used by the BANDHAN Government-Authorized Control Room Portal.

Run with: ``uvicorn bandhan_ml.scheduler_api.app:app --port 8001``
"""

import re
import os
import sys
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any, Dict

import joblib
import pandas as pd
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bandhan_ml.features.pipeline import FEATURE_COLS
from bandhan_ml.models.m3_priority import calculate_priority_score
from bandhan_ml.optimizer.data_utils import (
    PLANNING_START, load_pending_tasks, load_sections, load_timetable,
    predict_duration_direct, _get_traffic_density_for_section,
)
from bandhan_ml.optimizer.evaluator import compare_schedulers, compute_kpis
from bandhan_ml.optimizer.planner import plan_monthly, plan_weekly, replan_disruption
from bandhan_ml.optimizer.baseline_scheduler import schedule_baseline
from bandhan_ml.optimizer.smart_scheduler import schedule_greedy_smart, _count_possessions
from bandhan_ml.integrations.sources import load_operational_bundle
from bandhan_ml.ingestion import build_operational_graph, spatial_feature_store_snapshot
from bandhan_ml.operations import horizon_policy, validate_freeze_window_modification
from bandhan_ml.dispatch import build_bdms_submission
from bandhan_ml.predictive import dynamic_risk_index
from bandhan_ml.optimizer.virtual_train import build_virtual_trains, build_maintenance_virtual_trains, generate_time_space_canvas_data
from bandhan_ml.optimizer.lagrangian import capacity_prices, compute_lagrangian_dual_bound
from bandhan_ml.optimizer.shadow_engine import group_multi_department_tasks, detect_multi_department_shadows
from .schemas import (
    ComparisonResponse, PlanRequest, PlanResponse, ReplanRequest,
    ScheduleItem, SectionItem, TaskItem, ForecastItem,
)

app = FastAPI(title="BANDHAN Railway Block Planning API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_lock = Lock()
_state: Dict[str, Any] = {"weekly": None, "monthly": None, "diff": pd.DataFrame(), "tasks": None, "comparison": None}
_M1_PAYLOAD = None


@app.get("/health")
def health():
    """Operational readiness check for orchestration and monitoring."""
    sources = {}
    for name in ("tms", "smms", "tdms", "corridor", "coa_timetable", "goods_forecast"):
        env_name = f"BANDHAN_{name.upper()}_URL"
        sources[name] = "rest" if os.getenv(env_name) else "fixture"
    return {
        "status": "healthy",
        "service": "BANDHAN Block Allocation Engine",
        "architecture": "bandhan-5-layer-v2",
        "sources": sources,
        "m1_model": (ROOT / "bandhan_ml/saved_models/m1_escalation.joblib").exists(),
        "m2_model": (ROOT / "bandhan_ml/saved_models/m2_duration.joblib").exists(),
        "m5_model": (ROOT / "bandhan_ml/saved_models/m5_rul.joblib").exists(),
        "m6_model": (ROOT / "bandhan_ml/saved_models/m6_goods_forecast.joblib").exists(),
        "synthetic_evidence": True,
    }


@app.get("/architecture")
def architecture():
    """Expose implementation status of all 5 architecture layers."""
    bundle = load_operational_bundle()
    tasks_frame = load_pending_tasks()
    shadow_info = detect_multi_department_shadows(tasks_frame)

    plan = _state["weekly"]
    if plan is None:
        plan = _ensure_weekly()

    shad_prices = capacity_prices(plan) if plan is not None else {}
    dual_bounds = compute_lagrangian_dual_bound(120.0, shad_prices)

    return {
        "layers": [
            {
                "id": "ingestion",
                "name": "1. INGESTION LAYER",
                "status": "operational",
                "components": ["TMS (Track)", "SMMS (Signal)", "TDMS (TRD OHE)", "COA (Timetable)", "HMAC SHA-256 Verifier", "ULRS Normalizer", "Spatial Feature Store"]
            },
            {
                "id": "predictive",
                "name": "2. PREDICTIVE ENGINE",
                "status": "operational",
                "components": ["M1 Defect Failure Risk P(t)", "M2 CQR Duration Quantiles", "M3 Expected Deferral Cost", "M4 Headway + Delay Impact", "M5 RUL / Failure Horizon", "M6 Goods Forecast"]
            },
            {
                "id": "optimization",
                "name": "3. OPTIMIZATION ENGINE",
                "status": "operational",
                "components": ["Fairness-aware Nash Utility", "Virtual Train Network (Luan et al.)", "Independent Safety Verifier", "ALNS Event-driven Re-optimization"]
            },
            {
                "id": "horizon",
                "name": "4. OPERATIONAL HORIZON CONTROLLER",
                "status": "operational",
                "components": ["Monthly Strategic (T-30d -> T-7d)", "Weekly Operational (T-7d -> T-24h)", "24h Freeze Window Execution Lock (Override: DRI >= 0.85)"]
            },
            {
                "id": "dispatch",
                "name": "5. PRESENTATION & DISPATCH",
                "status": "operational",
                "components": ["CRIS Government Portal UI", "WebGL/SVG Time-Space Canvas", "Auto-BDMS Submission Engine"]
            },
        ],
        "graph": build_operational_graph(bundle),
        "spatial_feature_store": spatial_feature_store_snapshot(bundle),
        "virtual_trains_count": len(build_virtual_trains(bundle["coa"], PLANNING_START)),
        "multi_department_shadows": shadow_info,
        "capacity_shadow_prices": shad_prices,
        "lagrangian_dual_bounds": dual_bounds
    }


@app.get("/plan/ml_evidence")
def ml_evidence():
    """Expose generated synthetic model evidence to the control-room UI."""
    metrics = {}
    for name in ("m1_audit", "m2_metrics", "m4_delay_metrics", "m5_metrics", "m6_metrics", "benchmark_status"):
        path = ROOT / "results" / f"{name}.json"
        if path.exists():
            metrics[name] = json.loads(path.read_text())
    plan = _state.get("weekly")
    verification = plan.attrs.get("verification", {"valid": False, "violation_count": None}) if plan is not None else {"valid": False, "violation_count": None}
    return {"dataset": "seeded synthetic evidence dataset", "metrics": metrics, "plan_verification": verification, "claims_policy": "Synthetic metrics only; validate with railway operations data before deployment."}


@app.get("/plan/predicted_block_demand")
def predicted_block_demand():
    """Return synthetic M5-derived block demand for assets without open defects."""
    path = ROOT / "results" / "m5_predictions.csv"
    if not path.exists():
        return {"status": "unavailable", "items": []}
    predictions = pd.read_csv(path).head(100)
    return {
        "status": "synthetic_evidence",
        "items": [{"asset_id": str(row.get("asset_id", "synthetic_asset")), "p_fail_7d": None, "p_fail_30d": float(row.get("p_fail_30d", 0)), "median_rul_days": float(row.get("median_rul", 0)), "recommended_block_demand": bool(float(row.get("p_fail_30d", 0)) >= 0.5)} for _, row in predictions.iterrows()],
    }


@app.get("/plan/horizon/{horizon}")
def horizon(horizon: str):
    if horizon not in {"monthly", "weekly", "replanned", "daily"}:
        raise HTTPException(status_code=400, detail="horizon must be monthly, weekly, daily, or replanned")
    return horizon_policy(horizon)


@app.post("/plan/freeze_check")
def freeze_check(payload: Dict[str, Any]):
    task_id = str(payload.get("task_id", "BLK_001"))
    scheduled_start = payload.get("scheduled_start", datetime.now().isoformat())
    dri = float(payload.get("dynamic_risk_index", 0.75))
    return validate_freeze_window_modification(task_id, scheduled_start, dri)


@app.get("/plan/time_space_graph")
def time_space_graph():
    """Return virtual train and maintenance block trajectories for WebGL / Canvas visualizer."""
    bundle = load_operational_bundle()
    real_trains = build_virtual_trains(bundle["coa"], PLANNING_START)

    plan = _state["weekly"]
    if plan is None:
        plan = _ensure_weekly()

    blocks = plan.to_dict("records") if plan is not None and not plan.empty else []
    block_trains = build_maintenance_virtual_trains(blocks, PLANNING_START)

    return generate_time_space_canvas_data(real_trains, block_trains)


@app.get("/plan/dispatch/preview")
def dispatch_preview():
    plan = _state["weekly"]
    if plan is None:
        plan = _ensure_weekly()
    return build_bdms_submission(plan, "weekly")


def _risk_model_score(row: pd.Series) -> float:
    global _M1_PAYLOAD
    try:
        if _M1_PAYLOAD is None:
            _M1_PAYLOAD = joblib.load(ROOT / "bandhan_ml/saved_models/m1_escalation.joblib")
        payload = _M1_PAYLOAD
        encoders = payload["encoders"]
        data = {}
        raw = row.to_dict()
        for col in FEATURE_COLS:
            if col.endswith("_code"):
                name = col[:-5]
                val = str(raw.get(name, ""))
                encoder = encoders.get(name)
                data[col] = int(encoder.transform([val])[0]) if encoder is not None and val in set(encoder.classes_) else 0
            else:
                data[col] = float(raw.get(col, 0.0) or 0.0)
        return round(float(payload["calibrated_model"].predict_proba(pd.DataFrame([data]))[0, 1]), 4)
    except Exception:
        return round(min(0.99, max(0.05, float(row.get("severity_grade", 1)) / 4.0)), 4)


def _tasks_with_scores() -> pd.DataFrame:
    if _state["tasks"] is not None:
        return _state["tasks"].copy()
    tasks = load_pending_tasks()
    sections = load_sections()
    model_fields = ["asset_age_years", "inspection_score", "traffic_density", "daily_train_count",
                    "average_speed_kmph", "resource_availability", "asset_criticality", "operational_impact"]
    tasks["data_quality"] = tasks.apply(
        lambda row: "complete" if all(c in row.index and pd.notna(row.get(c)) for c in model_fields) else "imputed",
        axis=1,
    )
    risk = []
    p50s, p90s, priorities = [], [], []
    for _, row in tasks.iterrows():
        r = _risk_model_score(row)
        p50, p90, _ = predict_duration_direct(row)
        traffic = _get_traffic_density_for_section(row["section_id"], sections)
        priority = calculate_priority_score(str(row.get("severity_str", "Medium")), r, traffic,
                                             float(row.get("urgency", 5.0)), float(row.get("overdue_days", 0)))
        risk.append(r); p50s.append(p50); p90s.append(p90); priorities.append(priority)
    tasks["risk_score"] = risk
    tasks["duration_p50_hours"] = p50s
    tasks["duration_p90_hours"] = p90s
    tasks["priority_score"] = priorities
    _state["tasks"] = tasks.sort_values("priority_score", ascending=False).reset_index(drop=True)
    return _state["tasks"].copy()


def _json_value(value: Any) -> Any:
    if pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()
    return value.item() if hasattr(value, "item") else value


def _schedule_records(plan: pd.DataFrame):
    if plan is None or plan.empty:
        return []
    return [ScheduleItem(**{k: _json_value(v) for k, v in row.items()}) for row in plan.to_dict("records")]


def _plan_response(plan: pd.DataFrame, plan_type: str, diff: pd.DataFrame | None = None) -> PlanResponse:
    tasks = load_pending_tasks()
    sections = load_sections()
    horizon = int(plan.attrs.get("horizon_days", 7 if plan_type != "monthly" else 30))
    kpis = compute_kpis(plan, tasks, {s: None for s in sections["section_id"]}, horizon_days=horizon)
    kpis["possessions_used"] = _count_possessions(plan)
    kpis["independent_verification"] = plan.attrs.get("verification", {"valid": False, "violation_count": None})
    changes = [] if diff is None or diff.empty else [{k: _json_value(v) for k, v in r.items()} for r in diff.to_dict("records")]
    return PlanResponse(plan_type=plan_type, horizon_days=horizon, generated_at=datetime.now(),
                        schedule=_schedule_records(plan), kpis=kpis, changes=changes)


def _ensure_weekly():
    if _state["weekly"] is None:
        _state["weekly"] = plan_weekly(load_pending_tasks(), load_sections(), load_timetable(),
                                        week_start=PLANNING_START, time_limit_s=15)
    return _state["weekly"]


@app.post("/plan/weekly", response_model=PlanResponse)
def weekly_plan(req: PlanRequest = PlanRequest()):
    with _lock:
        cache_key = f"weekly_{req.method}"
        if cache_key not in _state or req.time_limit_s:
            tasks, sections, timetable = load_pending_tasks(), load_sections(), load_timetable()
            if req.method == "baseline":
                plan = schedule_baseline(tasks, sections, timetable, horizon_days=7, base_date=PLANNING_START)
            elif req.method == "greedy_smart":
                plan = schedule_greedy_smart(tasks, sections, timetable, horizon_days=7, base_date=PLANNING_START)
            else:
                plan = plan_weekly(tasks, sections, timetable, week_start=PLANNING_START,
                                   time_limit_s=req.time_limit_s or 15)
            _state[cache_key] = plan
            if req.method == "optimized":
                _state["weekly"] = plan
        return _plan_response(_state[cache_key], req.method)


@app.post("/plan/monthly", response_model=PlanResponse)
def monthly_plan(req: PlanRequest = PlanRequest()):
    with _lock:
        if _state["monthly"] is None or req.time_limit_s:
            _state["monthly"] = plan_monthly(load_pending_tasks(), load_sections(), load_timetable(),
                                              base_date=PLANNING_START, horizon_days=req.horizon_days or 30,
                                              time_limit_s=req.time_limit_s or 20)
        return _plan_response(_state["monthly"], "monthly")


@app.post("/plan/replan", response_model=PlanResponse)
def replan(req: ReplanRequest = ReplanRequest()):
    with _lock:
        existing = _ensure_weekly()
        new_plan, diff = replan_disruption(existing, load_pending_tasks(), load_sections(), load_timetable(),
                                           event_type=req.event_type, event_section=req.event_section,
                                           event_time=req.event_time, freeze_window_hrs=req.freeze_window_hrs,
                                           num_new_defects=req.num_new_defects, surge_factor=req.surge_factor,
                                           time_limit_s=req.time_limit_s)
        _state["weekly"], _state["diff"] = new_plan, diff
        return _plan_response(new_plan, "replanned", diff)


@app.get("/plan/tasks", response_model=list[TaskItem])
def tasks():
    df = _tasks_with_scores()
    return [TaskItem(task_id=str(r.defect_id), section_id=str(r.section_id), department=str(r.department),
                     asset_type=str(r.asset_type), defect_type=str(r.defect_type), severity_grade=int(r.severity_grade),
                     risk_score=float(r.risk_score), duration_p50_hours=float(r.duration_p50_hours),
                     duration_p90_hours=float(r.duration_p90_hours), priority_score=float(r.priority_score),
                     overdue_days=float(r.overdue_days),
                     data_quality=str(r.data_quality),
                     source_system="TMS" if str(r.department) == "Engineering" else ("SMMS" if str(r.department) == "S&T" else "TDMS"))
            for r in df.itertuples()]


@app.get("/plan/sections", response_model=list[SectionItem])
def sections():
    sdf = load_sections()
    plan = _state["weekly"]
    occupancy = {}
    if plan is not None and not plan.empty:
        for sec, group in plan.groupby("section_id"):
            occupancy[sec] = (float(group["duration_hours"].sum()), len(group))
    return [SectionItem(section_id=str(r.section_id), section_name=str(r.section_name),
                        from_station_id=str(r.from_station_id), to_station_id=str(r.to_station_id),
                        length_km=float(r.length_km), traffic_class=str(r.traffic_class), num_tracks=int(r.num_tracks),
                        occupancy_hours=occupancy.get(r.section_id, (0.0, 0))[0],
                        occupied_tasks=occupancy.get(r.section_id, (0.0, 0))[1]) for r in sdf.itertuples()]


@app.get("/plan/forecast", response_model=list[ForecastItem])
def goods_forecast():
    forecast = load_operational_bundle()["goods_forecast"].copy()
    if forecast.empty:
        return []
    if "source" not in forecast.columns:
        forecast["source"] = "COA-derived local forecast"
    return [ForecastItem(section_id=str(r.section_id), day_of_week=int(r.day_of_week),
                         forecast_goods_trains=int(r.forecast_goods_trains), source=str(r.source))
            for r in forecast.itertuples()]


def _comparison() -> dict:
    if _state["comparison"] is None:
        tasks, sections, timetable = load_pending_tasks(), load_sections(), load_timetable()
        results = compare_schedulers(tasks, sections, timetable, horizon_days=7, base_date=PLANNING_START, time_limit_s=5)
        methods = ["baseline", "greedy_smart", "optimized"]
        keys = sorted(set().union(*(results[m].keys() for m in methods)))
        metrics = {key: {method: results[method].get(key, 0) for method in methods} for key in keys}
        optimized, baseline = results["optimized"], results["baseline"]
        _state["comparison"] = {
            "generated": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "corridor": "NDLS-GZB-ALJN (Northern Railway / North Central)",
            "horizon": f"7-day weekly plan | {len(tasks)} total pending tasks",
            "total_pending_tasks": len(tasks),
            "summary": {
                "gap_fit_quality": f"{optimized.get('avg_gap_fit', 0):.4f} BANDHAN optimized average",
                "possessions_used": f"{optimized.get('possessions_used', 0)} optimized vs {baseline.get('possessions_used', 0)} baseline",
                "est_delay_minutes": f"{optimized.get('est_delay_minutes', 0)} proxy delay minutes",
                "asset_availability": f"{optimized.get('asset_availability_pct', 0)}% optimized corridor availability",
            },
            "metrics": metrics,
            "methods": {"baseline": "Naive severity-first scheduler", "greedy_smart": "M1/M2/M3/M4 heuristic scheduler", "optimized": "CP-SAT/ALNS BANDHAN optimized solver"},
            "assumptions": ["Minimum possession: 2h; maximum possession: 8h.", "Three crews per department per day.", "Delay-minutes and availability are operational proxies."],
        }
    return _state["comparison"]


@app.get("/plan/compare", response_model=ComparisonResponse)
def compare():
    return _comparison()


# Serve static React UI build if dist exists
DIST_PATH = ROOT / "INDIAN_RAILWAYS-main" / "dist"
if DIST_PATH.exists():
    app.mount("/", StaticFiles(directory=str(DIST_PATH), html=True), name="static_ui")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
