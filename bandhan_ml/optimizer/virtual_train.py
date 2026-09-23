"""
BANDHAN Optimization Core - Virtual Train Time-Space Network Model (Luan et al.)
Models maintenance possessions as "virtual trains" occupying section capacity over time-space trajectories.
"""

from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from typing import Any
import pandas as pd


@dataclass(frozen=True)
class VirtualTrain:
    train_id: str
    section_id: str
    start_time: datetime
    end_time: datetime
    traffic_class: str = "scheduled"  # scheduled, goods_forecast, or virtual_maintenance_block
    department: str = "OPERATIONS"
    start_km: float = 0.0
    end_km: float = 25.0

    def as_dict(self) -> dict:
        return {
            **asdict(self),
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat()
        }


def build_virtual_trains(timetable: pd.DataFrame, base_date: datetime | None = None) -> list[VirtualTrain]:
    """Build virtual trains from train timetable dataframe."""
    base_date = base_date or datetime.now().replace(minute=0, second=0, microsecond=0)
    trains: list[VirtualTrain] = []

    if timetable is None or len(timetable) == 0:
        return trains

    for row in timetable.itertuples(index=False):
        day_offset = int(getattr(row, "day_of_week", getattr(row, "day", 0)))
        hour_offset = int(getattr(row, "scheduled_hour", getattr(row, "hour", 8)))
        minute_offset = int(getattr(row, "scheduled_minute", getattr(row, "minute", 0)))

        start = base_date + timedelta(days=day_offset, hours=hour_offset, minutes=minute_offset)
        duration = max(15, int(getattr(row, "occupancy_duration_mins", getattr(row, "duration_mins", 30))))
        end = start + timedelta(minutes=duration)

        train_id = str(getattr(row, "train_id", getattr(row, "train_no", f"TRN_{len(trains)+1:03d}")))
        sec_id = str(getattr(row, "section_id", "SEC_0001"))
        traffic_cls = str(getattr(row, "train_type", getattr(row, "traffic_class", "scheduled")))
        start_km = float(getattr(row, "start_km", 0.0))
        end_km = float(getattr(row, "end_km", 25.0))

        trains.append(VirtualTrain(
            train_id=train_id,
            section_id=sec_id,
            start_time=start,
            end_time=end,
            traffic_class=traffic_cls,
            department="OPERATIONS",
            start_km=start_km,
            end_km=end_km
        ))

    return trains


def build_maintenance_virtual_trains(scheduled_blocks: list[dict[str, Any]], base_date: datetime | None = None) -> list[VirtualTrain]:
    """Model scheduled maintenance possessions as virtual trains in the time-space network."""
    base_date = base_date or datetime.now()
    maintenance_trains: list[VirtualTrain] = []

    for block in scheduled_blocks:
        start_str = block.get("start_time")
        if isinstance(start_str, str):
            try:
                start = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
            except ValueError:
                start = base_date
        elif isinstance(start_str, datetime):
            start = start_str
        else:
            start = base_date

        dur_hours = float(block.get("duration_hours", 3.0))
        end = start + timedelta(hours=dur_hours)
        sec_id = str(block.get("section_id", "SEC_0001"))
        task_id = str(block.get("task_id", block.get("block_id", f"BLK_VIRTUAL_{len(maintenance_trains)+1:03d}")))
        dept = str(block.get("department", "Engineering"))

        maintenance_trains.append(VirtualTrain(
            train_id=f"VIRTUAL_BLOCK_{task_id}",
            section_id=sec_id,
            start_time=start,
            end_time=end,
            traffic_class="virtual_maintenance_block",
            department=dept,
            start_km=float(block.get("start_km", 5.0)),
            end_km=float(block.get("end_km", 18.0))
        ))

    return maintenance_trains


def generate_time_space_canvas_data(real_trains: list[VirtualTrain], block_trains: list[VirtualTrain]) -> dict[str, Any]:
    """Format combined trajectories into canvas-friendly JSON structure."""
    all_trains = [t.as_dict() for t in real_trains] + [t.as_dict() for t in block_trains]
    sections = sorted(list({t["section_id"] for t in all_trains}))

    return {
        "network_sections": sections,
        "total_trajectories": len(all_trains),
        "scheduled_trains_count": len(real_trains),
        "maintenance_blocks_count": len(block_trains),
        "trajectories": all_trains
    }
