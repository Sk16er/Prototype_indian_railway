"""
BANDHAN ML - M2: Repair Duration Quantile Model (100k Dataset)
Predicts p50 (median) and p90 (safety buffer) repair duration_hours using LightGBM Quantile Regression.
"""

import os
import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
import matplotlib.pyplot as plt
import json
from bandhan_ml.models.cqr_duration import GroupwiseCQR

from bandhan_ml.features.pipeline import load_split_data, preprocess_features, FEATURE_COLS

def pinball_loss(y_true, y_pred, alpha):
    err = y_true - y_pred
    return np.mean(np.maximum(alpha * err, (alpha - 1) * err))

def train_m2_model(
    data_dir: str = "bandhan_ml/Data_test",
    saved_models_dir: str = "bandhan_ml/saved_models",
    output_dir: str = "results"
):
    os.makedirs(saved_models_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Load train & test datasets
    train_df = load_split_data("train", data_dir=data_dir)
    calibration_df = load_split_data("validation", data_dir=data_dir)
    test_df = load_split_data("test", data_dir=data_dir)
    
    X_train, _, y_train, _, encoders, _ = preprocess_features(train_df)
    X_test, _, y_test, _, _, _ = preprocess_features(test_df, encoders=encoders)
    X_cal, _, y_cal, _, _, _ = preprocess_features(calibration_df, encoders=encoders)
    
    print(f"[STAGE 4: M2] Training Quantile Regressors (Train: {len(X_train)}, Test: {len(X_test)})")
    
    # 2. Train p50 model (alpha = 0.50)
    model_p50 = LGBMRegressor(
        objective="quantile",
        alpha=0.50,
        n_estimators=150,
        learning_rate=0.05,
        num_leaves=31,
        random_state=42,
        verbosity=-1
    )
    model_p50.fit(X_train, y_train)
    
    # 3. Train p90 model (alpha = 0.90)
    model_p90 = LGBMRegressor(
        objective="quantile",
        alpha=0.90,
        n_estimators=150,
        learning_rate=0.05,
        num_leaves=31,
        random_state=42,
        verbosity=-1
    )
    model_p90.fit(X_train, y_train)
    
    # 4. Predictions & Evaluation
    preds_p50 = model_p50.predict(X_test)
    preds_p90 = model_p90.predict(X_test)
    cal_p50 = model_p50.predict(X_cal)
    cal_p90 = model_p90.predict(X_cal)
    calibrator = GroupwiseCQR(target_coverage=0.90).fit(
        y_cal.to_numpy(), cal_p50, cal_p90,
        calibration_df[["department", "asset_type"]],
    )
    calibrated_lower, calibrated_upper = calibrator.predict(
        model_p50.predict(X_test), model_p90.predict(X_test),
        test_df[["department", "asset_type"]],
    )
    
    loss_p50 = pinball_loss(y_test, preds_p50, alpha=0.50)
    loss_p90 = pinball_loss(y_test, preds_p90, alpha=0.90)
    empirical_coverage = np.mean(y_test <= preds_p90) * 100.0
    calibrated_coverage = np.mean((y_test >= calibrated_lower) & (y_test <= calibrated_upper)) * 100.0
    
    print(f"[STAGE 4: M2] Evaluation Results (100k Harvested Test Set):")
    print(f"  - p50 Pinball Loss: {loss_p50:.4f}")
    print(f"  - p90 Pinball Loss: {loss_p90:.4f}")
    print(f"  - Empirical p90 Coverage: {empirical_coverage:.2f}% (Target: ~90%)")
    print(f"  - CQR interval Coverage: {calibrated_coverage:.2f}% (Target: ~90%)")

    try:
        import shap
        explanation = shap.TreeExplainer(model_p50)(X_test.sample(min(500, len(X_test)), random_state=42))
        shap.summary_plot(explanation, X_test.sample(min(500, len(X_test)), random_state=42), show=False)
        plt.tight_layout(); plt.savefig(os.path.join(saved_models_dir, "m2_shap_summary.png"), dpi=160, bbox_inches="tight"); plt.close()
    except Exception:
        plt.figure(figsize=(8, 4)); plt.barh(FEATURE_COLS, model_p50.feature_importances_); plt.tight_layout(); plt.savefig(os.path.join(saved_models_dir, "m2_shap_summary.png"), dpi=160); plt.close()
    
    # Save Model Payload
    model_payload = {
        "model_p50": model_p50,
        "model_p90": model_p90,
        "cqr_calibrator": calibrator,
        "encoders": encoders,
        "feature_cols": FEATURE_COLS,
        "metrics": {
            "loss_p50": float(loss_p50),
            "loss_p90": float(loss_p90),
            "empirical_coverage_p90": float(empirical_coverage)
            ,"cqr_interval_coverage": float(calibrated_coverage),
            "cqr_coverage_by_group": calibrator.coverage_table(y_test.to_numpy(), calibrated_lower, calibrated_upper, test_df[["department", "asset_type"]]),
        }
    }
    joblib.dump(model_payload, os.path.join(saved_models_dir, "m2_duration.joblib"))
    with open(os.path.join(output_dir, "m2_metrics.json"), "w") as metrics_file:
        json.dump(model_payload["metrics"], metrics_file, indent=2, sort_keys=True)
    print(f"[STAGE 4: M2] Saved model artifact to '{saved_models_dir}/m2_duration.joblib'")
    return model_payload

if __name__ == "__main__":
    train_m2_model()
