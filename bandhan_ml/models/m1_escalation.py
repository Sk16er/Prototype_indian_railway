"""
BANDHAN ML - M1: Safety / Escalation Risk Model (100k Dataset)
Predicts probability of high/critical safety risk using XGBoost, Platt calibration, and SHAP explainability.
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
import matplotlib.pyplot as plt

from xgboost import XGBClassifier
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.metrics import precision_recall_curve, auc, fbeta_score, brier_score_loss
import shap

from bandhan_ml.features.pipeline import load_split_data, preprocess_features, FEATURE_COLS

def train_m1_model(
    data_dir: str = "bandhan_ml/Data_test",
    saved_models_dir: str = "bandhan_ml/saved_models",
    plot_dir: str = "bandhan_ml/notebooks_or_scripts"
):
    os.makedirs(saved_models_dir, exist_ok=True)
    os.makedirs(plot_dir, exist_ok=True)
    
    # 1. Load train, val, test datasets
    train_df = load_split_data("train", data_dir=data_dir)
    test_df = load_split_data("test", data_dir=data_dir)
    
    X_train, y_train, _, _, encoders, train_proc = preprocess_features(train_df)
    X_test, y_test, _, _, _, test_proc = preprocess_features(test_df, encoders=encoders)
    
    print(f"[STAGE 3: M1] Dataset Split:")
    print(f"  - Train records: {len(X_train)} (Positives: {y_train.sum()}, Ratio: {y_train.mean()*100:.2f}%)")
    print(f"  - Test records:  {len(X_test)} (Positives: {y_test.sum()}, Ratio: {y_test.mean()*100:.2f}%)")
    
    # 2. Train XGBoost Base Classifier with scale_pos_weight
    pos_count = y_train.sum()
    neg_count = len(y_train) - pos_count
    scale_pos_weight = neg_count / max(1, pos_count)
    
    base_xgb = XGBClassifier(
        n_estimators=150,
        max_depth=5,
        learning_rate=0.05,
        scale_pos_weight=scale_pos_weight,
        base_score=0.5,
        random_state=42,
        eval_metric="logloss"
    )
    base_xgb.fit(X_train, y_train)
    
    raw_probs_test = base_xgb.predict_proba(X_test)[:, 1]
    
    # 3. Platt Scaling Calibration
    calibrated_model = CalibratedClassifierCV(estimator=base_xgb, method="sigmoid", cv=3)
    calibrated_model.fit(X_train, y_train)
    
    calibrated_probs_test = calibrated_model.predict_proba(X_test)[:, 1]
    
    # 4. Evaluation
    precision, recall, thresholds = precision_recall_curve(y_test, calibrated_probs_test)
    pr_auc = auc(recall, precision)
    
    f2_scores = []
    for th in np.linspace(0.05, 0.85, 81):
        preds = (calibrated_probs_test >= th).astype(int)
        f2 = fbeta_score(y_test, preds, beta=2.0, zero_division=0)
        f2_scores.append((th, f2))
        
    best_th, best_f2 = max(f2_scores, key=lambda x: x[1])
    
    brier_raw = brier_score_loss(y_test, raw_probs_test)
    brier_calib = brier_score_loss(y_test, calibrated_probs_test)
    
    print(f"\n[STAGE 3: M1] Evaluation Results (100k Harvested Test Set):")
    print(f"  - PR-AUC: {pr_auc:.4f}")
    print(f"  - Optimal F2 Threshold: {best_th:.2f} (F2-Score: {best_f2:.4f})")
    print(f"  - Brier Score (Raw vs Calibrated): {brier_raw:.4f} -> {brier_calib:.4f}")
    
    # 5. Plots
    plt.figure(figsize=(7, 5))
    fraction_of_pos_raw, mean_predicted_value_raw = calibration_curve(y_test, raw_probs_test, n_bins=8)
    fraction_of_pos_calib, mean_predicted_value_calib = calibration_curve(y_test, calibrated_probs_test, n_bins=8)
    
    plt.plot(mean_predicted_value_raw, fraction_of_pos_raw, "s-", label="Uncalibrated XGBoost")
    plt.plot(mean_predicted_value_calib, fraction_of_pos_calib, "o-", label="Platt Calibrated")
    plt.plot([0, 1], [0, 1], "k--", label="Perfectly Calibrated")
    plt.title("M1 Calibration Curve (Reliability Diagram)")
    plt.xlabel("Mean Predicted Probability")
    plt.ylabel("Fraction of Positives")
    plt.legend(loc="lower right")
    plt.tight_layout()
    plt.savefig(os.path.join(plot_dir, "m1_calibration_curve.png"), dpi=200)
    plt.close()
    
    plt.figure(figsize=(7, 5))
    plt.plot(recall, precision, label=f"Calibrated XGBoost (PR-AUC = {pr_auc:.3f})")
    plt.xlabel("Recall")
    plt.ylabel("Precision")
    plt.title("M1 Precision-Recall Curve")
    plt.legend()
    plt.tight_layout()
    plt.savefig(os.path.join(plot_dir, "m1_pr_curve.png"), dpi=200)
    plt.close()
    
    # 6. SHAP Summary
    X_sample = X_test.sample(n=min(100, len(X_test)), random_state=42)
    try:
        explainer = shap.Explainer(base_xgb.predict_proba, X_train.sample(n=30, random_state=42))
        shap_values = explainer(X_sample, max_evals=2 * len(FEATURE_COLS) + 1)
        if len(shap_values.shape) == 3:
            shap_values = shap_values[:, :, 1]
    except Exception as e:
        print(f"[STAGE 3: M1] SHAP fallback warning: {e}")
        explainer = shap.Explainer(base_xgb.predict_proba, X_train.sample(n=10, random_state=42))
        shap_values = explainer(X_sample, max_evals=25)
        if len(shap_values.shape) == 3:
            shap_values = shap_values[:, :, 1]
            
    plt.figure(figsize=(8, 6))
    shap.summary_plot(shap_values, X_sample, show=False)
    plt.tight_layout()
    plt.savefig(os.path.join(plot_dir, "m1_shap_summary.png"), dpi=200, bbox_inches="tight")
    plt.close()
    
    # 7. Print 5 example predictions
    test_proc["predicted_risk"] = calibrated_probs_test
    pos_samples = test_proc[test_proc["safety_risk"].astype(str).str.upper() == "HIGH"].head(3)
    neg_samples = test_proc[test_proc["safety_risk"].astype(str).str.upper() != "HIGH"].head(2)
    sample_5 = pd.concat([pos_samples, neg_samples], ignore_index=True)
    
    print("\n" + "=" * 90)
    print("                M1 HARVESTED DATASET EVALUATION EXAMPLES (5 SAMPLE ROWS)")
    print("=" * 90)
    for idx, r in sample_5.iterrows():
        feats = (
            f"AssetType={r['asset_type']}, DefectType={r['defect_type']}, "
            f"Len={r['defect_length_mm']}mm, Depth={r['defect_depth_mm']}mm, "
            f"Weather={r['weather_condition']}, Overdue={r['overdue_days']}d"
        )
        print(f"\nRow {idx+1}:")
        print(f"  - Maintenance ID:  {r['maintenance_id']} ({r['asset_id']} in {r['section_id']})")
        print(f"  - Features:        {feats}")
        print(f"  - Ground Truth:    Safety Risk = {r['safety_risk']}, Defect Severity = {r['defect_severity']}")
        print(f"  - Predicted Risk:  {r['predicted_risk']:.4f} (Flagged Critical: {r['predicted_risk'] >= best_th})")
    print("=" * 90 + "\n")
    
    # Save Model Payload
    model_payload = {
        "calibrated_model": calibrated_model,
        "base_model": base_xgb,
        "encoders": encoders,
        "feature_cols": FEATURE_COLS,
        "decision_threshold": float(best_th),
        "metrics": {
            "pr_auc": float(pr_auc),
            "f2_score": float(best_f2),
            "brier_score_calibrated": float(brier_calib)
        }
    }
    joblib.dump(model_payload, os.path.join(saved_models_dir, "m1_escalation.joblib"))
    print(f"[STAGE 3: M1] Saved model artifact to '{saved_models_dir}/m1_escalation.joblib'")
    return model_payload

if __name__ == "__main__":
    train_m1_model()
