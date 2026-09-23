"""Pydantic contracts for the scheduler and demo UI."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class PlanRequest(BaseModel):
    method: str = Field("optimized", pattern="^(baseline|greedy_smart|optimized)$")
    horizon_days: Optional[int] = Field(None, ge=1, le=30)
    time_limit_s: Optional[int] = Field(None, ge=1, le=60)


class ReplanRequest(BaseModel):
    event_type: str = Field("defect_burst", pattern="^(defect_burst|freight_surge)$")
    event_section: str = "SEC_01"
    event_time: Optional[datetime] = None
    num_new_defects: int = Field(5, ge=1, le=20)
    surge_factor: float = Field(1.4, ge=1.0, le=3.0)
    freeze_window_hrs: int = Field(48, ge=1, le=96)
    time_limit_s: int = Field(15, ge=1, le=60)


class ScheduleItem(BaseModel):
    task_id: str
    section_id: str
    start_time: datetime
    end_time: datetime
    department: str
    asset_type: str
    defect_type: str
    severity_grade: int
    duration_hours: float
    gap_fit_score: float
    priority_score: float
    is_consolidated: bool = False
    consolidation_group: str = ""


class PlanResponse(BaseModel):
    plan_type: str
    horizon_days: int
    generated_at: datetime
    schedule: List[ScheduleItem]
    kpis: Dict[str, Any]
    changes: List[Dict[str, Any]] = []


class TaskItem(BaseModel):
    task_id: str
    section_id: str
    department: str
    asset_type: str
    defect_type: str
    severity_grade: int
    risk_score: float
    duration_p50_hours: float
    duration_p90_hours: float
    priority_score: float
    overdue_days: float
    status: str = "PENDING"
    data_quality: str = "complete"
    source_system: str = "normalized_fixture"


class SectionItem(BaseModel):
    section_id: str
    section_name: str
    from_station_id: str
    to_station_id: str
    length_km: float
    traffic_class: str
    num_tracks: int
    occupancy_hours: float
    occupied_tasks: int


class ForecastItem(BaseModel):
    section_id: str
    day_of_week: int
    forecast_goods_trains: int
    source: str = "COA-derived local forecast"


class ComparisonResponse(BaseModel):
    generated: Optional[str]
    corridor: Optional[str]
    horizon: Optional[str]
    total_pending_tasks: Optional[int]
    summary: Dict[str, str]
    metrics: Dict[str, Dict[str, Any]]
    methods: Dict[str, str]
    assumptions: List[str]
