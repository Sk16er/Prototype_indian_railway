"""TMS/SMMS/TDMS/BDMS/COA-compatible source adapters.

These adapters deliberately normalize source data at the boundary. Railway
systems are usually institution-specific, so endpoint URLs and field mapping
belong in configuration rather than in the optimizer.
"""

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

_MAX_RESPONSE_BYTES = 16 * 1024 * 1024  # 16 MiB — guard against unbounded reads

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
                raw = response.read(_MAX_RESPONSE_BYTES + 1)
                if len(raw) > _MAX_RESPONSE_BYTES:
                    raise SourceError(
                        f"{self.name} response exceeded {_MAX_RESPONSE_BYTES // (1024*1024)} MiB limit"
                    )
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
        except SourceError:
            raise  # Don't double-wrap errors we already classified
        except Exception as exc:
            logger.warning("%s source read failed: %s", self.name, exc, exc_info=True)
            raise SourceError(f"{self.name} unavailable: {exc}") from exc


def source(name: str, fixture: Path) -> Any:
    """Use ``BANDHAN_<NAME>_URL`` when configured, otherwise a local fixture."""
    url = os.getenv(f"BANDHAN_{name.upper()}_URL")
    return RestSource(name, url) if url else CsvSource(name, fixture)


def load_operational_bundle() -> Dict[str, Any]:
    """Load and normalize the five logical operational inputs.

    Returns a dict with keys: tms, smms, tdms, bdms, coa, goods_forecast,
    plus ``_is_fallback`` — a dict[str, bool] indicating which sources fell
    back to CSV fixtures. Callers and the API layer must propagate this so
    operators can distinguish live data from stale fixture data.

    TMS/SMMS/TDMS currently share the defect fixture and are filtered by
    department. This mirrors the normalized contract that a production
    connector should return and keeps local development deterministic.
    """
    is_fallback: Dict[str, bool] = {}

    def _read_source(name: str, fixture_key: str) -> pd.DataFrame:
        """Read a named source, tracking whether it fell back to fixture."""
        src = source(name, DATA_DIR / DATA_FILES[fixture_key])
        fell_back = isinstance(src, CsvSource)
        try:
            df = src.read()
            is_fallback[name] = fell_back
            return df
        except SourceError:
            # Live source failed — fall back to CSV fixture and flag it.
            logger.warning(
                "%s live source failed — falling back to CSV fixture: %s",
                name, DATA_DIR / DATA_FILES[fixture_key],
            )
            is_fallback[name] = True
            return CsvSource(name, DATA_DIR / DATA_FILES[fixture_key]).read()

    defects  = _read_source("defects", "defects")
    sections = _read_source("corridor", "sections")
    timetable = _read_source("coa_timetable", "timetable")
    forecast_path = DATA_DIR / DATA_FILES["forecast"]
    if forecast_path.exists():
        forecast = _read_source("goods_forecast", "forecast")
    else:
        forecast = _forecast_from_timetable(timetable)
        is_fallback["goods_forecast"] = True

    def department_feed(name: str, asset_type: str) -> pd.DataFrame:
        configured = os.getenv(f"BANDHAN_{name.upper()}_URL")
        if configured:
            try:
                df = RestSource(name, configured).read()   # timeout=10 from __init__ default
                is_fallback[name] = False
                return df
            except SourceError as exc:
                logger.warning("%s department REST source failed: %s — using defect fixture", name, exc)
                is_fallback[name] = True
        else:
            is_fallback[name] = True
        return defects[defects["asset_type"].eq(asset_type)].copy() if "asset_type" in defects else defects.copy()

    return {
        "tms":            department_feed("tms",  "Track"),
        "smms":           department_feed("smms", "Signal"),
        "tdms":           department_feed("tdms", "OHE"),
        "bdms":           sections.copy(),
        "coa":            timetable.copy(),
        "goods_forecast": forecast,
        "_is_fallback":   is_fallback,   # Phase 5: callers MUST propagate this to the UI
    }


def _forecast_from_timetable(timetable: pd.DataFrame) -> pd.DataFrame:
    freight = timetable[timetable.get("train_type", pd.Series(dtype=str)).astype(str).str.contains("Freight|Goods", case=False, regex=True)]
    if freight.empty:
        return pd.DataFrame(columns=["section_id", "day_of_week", "forecast_goods_trains"])
    return (freight.groupby(["section_id", "day_of_week"]).size().reset_index(name="forecast_goods_trains"))

