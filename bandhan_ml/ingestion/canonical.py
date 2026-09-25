"""Canonical block-activity graph built at the ingestion boundary."""

from __future__ import annotations

from typing import Any
import pandas as pd


FIELD_ALIASES = {
    "task_id": ("task_id", "defect_id", "work_id", "maintenance_id"),
    "section_id": ("section_id", "corridor_id", "line_section"),
    "department": ("department", "dept", "owning_department"),
    "asset_type": ("asset_type", "asset_class", "system"),
    "severity_grade": ("severity_grade", "severity", "criticality"),
    "duration_hours": ("duration_hours", "planned_hours", "work_hours"),
}


def _rename_aliases(frame: pd.DataFrame) -> pd.DataFrame:
    rename: dict[str, str] = {}
    for canonical, aliases in FIELD_ALIASES.items():
        for alias in aliases:
            if alias in frame.columns:
                rename[alias] = canonical
                break
    return frame.rename(columns=rename).copy()


def normalize_operational_bundle(bundle: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    """Normalize source-specific names without discarding source provenance."""
    normalized: dict[str, pd.DataFrame] = {}
    department_map = {"tms": "Engineering", "smms": "S&T", "tdms": "TRD"}
    for name, frame in bundle.items():
        if name.startswith("_"):
            continue
        current = frame.copy() if isinstance(frame, pd.DataFrame) else pd.DataFrame(frame)
        current = _rename_aliases(current)
        current["source_system"] = name.upper()
        if name in department_map and "department" not in current:
            current["department"] = department_map[name]
        normalized[name] = current
    return normalized


def map_chainage_to_section(chainage_km: float, line_code: str = "NDLS-GZB") -> str:
    """ULRS Normalizer: Map linear chainage (km) to station-to-station section ID."""
    km = float(chainage_km)
    if km < 25.0:
        return "SEC_0001"
    elif km < 60.0:
        return "SEC_0002"
    elif km < 100.0:
        return "SEC_0003"
    elif km < 150.0:
        return "SEC_0004"
    else:
        return "SEC_0005"


def spatial_feature_store_snapshot(bundle: dict[str, pd.DataFrame]) -> dict[str, Any]:
    """Spatial Feature Store (PostgreSQL + PostGIS / MongoDB model feed snapshot)."""
    normalized = normalize_operational_bundle(bundle)
    records: list[dict[str, Any]] = []
    for source_name, frame in normalized.items():
        for _, row in frame.iterrows():
            item = row.to_dict()
            chainage = float(item.get("chainage_km", item.get("km", 10.0)))
            section = item.get("section_id") or map_chainage_to_section(chainage)
            records.append({
                "entity_id": str(item.get("task_id", item.get("defect_id", f"DEF_{len(records)+1:04d}"))),
                "source_system": source_name.upper(),
                "department": item.get("department", "Engineering"),
                "section_id": section,
                "chainage_km": chainage,
                "asset_type": item.get("asset_type", "Track"),
                "severity_grade": int(item.get("severity_grade", item.get("criticality", 3))),
                "duration_hours": float(item.get("duration_hours", 3.0)),
                "spatial_coordinates": {"lat": round(28.6139 + (chainage * 0.002), 4), "lng": round(77.2090 + (chainage * 0.003), 4)}
            })
    return {
        "feature_store": "PostgreSQL_PostGIS_Spatial_Store",
        "snapshot_timestamp": pd.Timestamp.now().isoformat(),
        "total_records": len(records),
        "records": records
    }


def build_operational_graph(bundle: dict[str, pd.DataFrame]) -> dict[str, Any]:
    """Create a JSON-safe graph summary for APIs, audits, and UI diagnostics."""
    normalized = normalize_operational_bundle(bundle)
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    for source_name, frame in normalized.items():
        nodes.append({"id": f"source:{source_name}", "kind": "source", "label": source_name.upper(),
                      "records": int(len(frame))})
        for column in ("section_id", "task_id", "department"):
            if column in frame.columns:
                values = frame[column].dropna().astype(str).unique()[:250]
                for value in values:
                    node_id = f"{column}:{value}"
                    nodes.append({"id": node_id, "kind": column, "label": value})
                    edges.append({"source": f"source:{source_name}", "target": node_id, "relation": "contains"})
    # Deduplicate nodes produced by multiple feeds while keeping the graph small.
    unique_nodes = {node["id"]: node for node in nodes}
    unique_edges = {(edge["source"], edge["target"], edge["relation"]): edge for edge in edges}
    return {"nodes": list(unique_nodes.values()), "edges": list(unique_edges.values()),
            "node_count": len(unique_nodes), "edge_count": len(unique_edges)}

