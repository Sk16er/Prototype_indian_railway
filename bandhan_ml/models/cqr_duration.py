"""Conformalized quantile regression utilities for M2."""

from __future__ import annotations

import numpy as np
import pandas as pd


class GroupwiseCQR:
    """Calibrate a lower/upper quantile pair globally and by operational group."""

    def __init__(self, target_coverage: float = 0.90, group_columns: tuple[str, ...] = ("department", "asset_type")):
        self.target_coverage = target_coverage
        self.group_columns = group_columns

    def fit(self, y_true, lower, upper, groups: pd.DataFrame):
        alpha = 1 - self.target_coverage
        scores = np.maximum.reduce([lower - y_true, y_true - upper, np.zeros(len(y_true))])
        self.global_q = float(np.quantile(scores, min(1.0, (len(scores) + 1) * (1 - alpha) / len(scores)), method="higher"))
        self.group_q = {}
        keys = groups[list(self.group_columns)].astype(str).agg("|".join, axis=1)
        for key, idx in keys.groupby(keys).groups.items():
            values = scores[np.asarray(list(idx))]
            self.group_q[key] = float(np.quantile(values, min(1.0, (len(values) + 1) * (1 - alpha) / len(values)), method="higher"))
        return self

    def predict(self, lower, upper, groups: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        keys = groups[list(self.group_columns)].astype(str).agg("|".join, axis=1)
        adjustments = np.array([self.group_q.get(key, self.global_q) for key in keys])
        return np.asarray(lower) - adjustments, np.asarray(upper) + adjustments

    def coverage_table(self, y_true, lower, upper, groups: pd.DataFrame) -> list[dict]:
        keys = groups[list(self.group_columns)].astype(str).agg("|".join, axis=1)
        frame = pd.DataFrame({"key": keys, "y": y_true, "lower": lower, "upper": upper})
        return [{"group": str(key), "n": int(len(group)), "coverage": float(np.mean((group.y >= group.lower) & (group.y <= group.upper)))} for key, group in frame.groupby("key")]