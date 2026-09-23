"""TMS/SMMS/TDMS/BDMS/COA-compatible source adapters.

These adapters deliberately normalize source data at the boundary. Railway
systems are usually institution-specific, so endpoint URLs and field mapping
belong in configuration rather than in the optimizer.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.request import Request, urlopen

import pandas as pd
from bandhan_ml.ingestion.security import verify_hmac_signature


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "bandhan_ml" / "data"
DATA_FILES = {"defects": "sample_defect_history_500.csv", "sections": "sample_sections_500.csv", "timetable": "sample_timetable_500.csv", "forecast": "sample_goods_forecast_500.csv"}


class SourceError(RuntimeError):
    """Raised when an operational source cannot be read or normalized."""


class CsvSource:
    def __init__(self, name: str, path: Path):
        self.name, self.path = name, Path(path)

    def read(self) -> pd.DataFrame:
        if not self.path.exists():
            raise SourceError(f"{self.name} fixture not found: {self.path}")
        return pd.read_csv(self.path)


class RestSource:
    def __init__(self, name: str, url: str, timeout_s: int = 10):
        self.name, self.url, self.timeout_s = name, url, timeout_s

    def read(self) -> pd.DataFrame:
        try:
            req = Request(self.url, headers={"Accept": "application/json"})
            with urlopen(req, timeout=self.timeout_s) as response:
                raw = response.read()
                secret = os.getenv(f"BANDHAN_{self.name.upper()}_HMAC_SECRET")
                signature = response.headers.get("X-Signature-256") or response.headers.get("X-Hub-Signature-256")
                if secret and not verify_hmac_signature(raw, signature, secret):
                    raise SourceError(f"{self.name} signature verification failed")
                payload = json.loads(raw.decode("utf-8"))
            if isinstance(payload, dict):
                payload = payload.get("data", payload.get("items", payload))
            if not isinstance(payload, list):
                raise ValueError("expected a JSON list or {data/items: [...]} payload")
            return pd.DataFrame(payload)
        except Exception as exc:
            raise SourceError(f"{self.name} unavailable: {exc}") from exc


def source(name: str, fixture: Path) -> Any:
    """Use ``BANDHAN_<NAME>_URL`` when configured, otherwise a local fixture."""
    url = os.getenv(f"BANDHAN_{name.upper()}_URL")
    return RestSource(name, url) if url else CsvSource(name, fixture)


def load_operational_bundle() -> Dict[str, pd.DataFrame]:
    """Load and normalize the five logical operational inputs.

    TMS/SMMS/TDMS currently share the defect fixture and are filtered by
    department. This mirrors the normalized contract that a production
    connector should return and keeps local development deterministic.
    """
    defects = source("defects", DATA_DIR / DATA_FILES["defects"]).read()
    sections = source("corridor", DATA_DIR / DATA_FILES["sections"]).read()
    timetable = source("coa_timetable", DATA_DIR / DATA_FILES["timetable"]).read()
    forecast_path = DATA_DIR / DATA_FILES["forecast"]
    forecast = source("goods_forecast", forecast_path).read() if forecast_path.exists() else _forecast_from_timetable(timetable)
    def department_feed(name: str, asset_type: str) -> pd.DataFrame:
        configured = os.getenv(f"BANDHAN_{name.upper()}_URL")
        if configured:
            return RestSource(name, configured).read()
        return defects[defects["asset_type"].eq(asset_type)].copy() if "asset_type" in defects else defects.copy()

    return {
        "tms": department_feed("tms", "Track"),
        "smms": department_feed("smms", "Signal"),
        "tdms": department_feed("tdms", "OHE"),
        "bdms": sections.copy(),
        "coa": timetable.copy(),
        "goods_forecast": forecast,
    }


def _forecast_from_timetable(timetable: pd.DataFrame) -> pd.DataFrame:
    freight = timetable[timetable.get("train_type", pd.Series(dtype=str)).astype(str).str.contains("Freight|Goods", case=False, regex=True)]
    if freight.empty:
        return pd.DataFrame(columns=["section_id", "day_of_week", "forecast_goods_trains"])
    return (freight.groupby(["section_id", "day_of_week"]).size().reset_index(name="forecast_goods_trains"))
