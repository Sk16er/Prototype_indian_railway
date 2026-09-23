"""
BANDHAN ML - Feature Engineering Pipeline (100k Harvested Dataset)
Processes train.csv, validation.csv, and test.csv from bandhan_ml/Data_test/
"""

import os
import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder

FEATURE_COLS = [
    "department_code",
    "asset_type_code",
    "corridor_class_code",
    "defect_type_code",
    "defect_length_mm",
    "defect_depth_mm",
    "defect_count",
    "asset_age_years",
    "last_maintenance_days",
    "overdue_days",
    "inspection_score",
    "traffic_density",
    "daily_train_count",
    "passenger_train_count",
    "goods_train_count",
    "average_speed_kmph",
    "trains_affected",
    "weather_condition_code",
    "temperature_c",
    "rainfall_mm",
    "previous_failures",
    "resource_required_code",
    "resource_availability",
    "asset_criticality",
    "urgency",
    "operational_impact"
]

# M1 must only use information available at inspection time.  In particular,
# downstream outcomes and labels are deliberately absent from this list.
M1_FEATURE_COLS = FEATURE_COLS.copy()
M1_EXCLUDED_COLUMNS = {
    "defect_severity", "maintenance_priority", "maintenance_duration_hours",
    "safety_risk", "priority_class", "asset_downtime_hours",
}

CATEGORICAL_COLS = [
    "department",
    "asset_type",
    "corridor_class",
    "defect_type",
    "weather_condition",
    "resource_required"
]

def load_split_data(split: str = "train", data_dir: str = "bandhan_ml/Data_test") -> pd.DataFrame:
    filename = f"{split}.csv"
    path = os.path.join(data_dir, filename)
    if not os.path.exists(path):
        # Fallback to railway_maintenance_ml_dataset_100k.csv if split file not found
        path = os.path.join(data_dir, "railway_maintenance_ml_dataset_100k.csv")
    return pd.read_csv(path)

def preprocess_features(df: pd.DataFrame, encoders: dict = None) -> tuple:
    """
    Transforms raw dataframe into feature matrix X, targets y_m1, y_m2, y_m3, and encoders dictionary.
    """
    df_copy = df.copy()
    if encoders is None:
        encoders = {}
        fit_encoders = True
    else:
        fit_encoders = False
        
    for col in CATEGORICAL_COLS:
        code_col = f"{col}_code"
        if fit_encoders:
            le = LabelEncoder()
            df_copy[code_col] = le.fit_transform(df_copy[col].astype(str))
            encoders[col] = le
        else:
            le = encoders[col]
            # Handle unseen categories gracefully
            known_classes = set(le.classes_)
            df_copy[col] = df_copy[col].astype(str).map(lambda s: s if s in known_classes else le.classes_[0])
            df_copy[code_col] = le.transform(df_copy[col])
            
    # Feature matrix X
    X = df_copy[FEATURE_COLS].copy()
    
    # M1 target is the supplied safety-risk label only.  OR-ing in final
    # defect severity made the target a post-outcome proxy and hid leakage.
    y_m1 = df_copy["safety_risk"].astype(str).str.upper().isin(
        {"HIGH", "CRITICAL", "1", "TRUE"}
    ).astype(int)
    
    # Target 2: M2 Maintenance Duration Hours
    y_m2 = df_copy["maintenance_duration_hours"].astype(float)
    
    # Target 3: M3 Maintenance Priority (Normalized 0 - 100)
    y_m3 = (df_copy["maintenance_priority"].astype(float) / 10.0 * 100.0).clip(lower=0.0, upper=100.0)
    
    return X, y_m1, y_m2, y_m3, encoders, df_copy

def build_feature_matrix(split: str = "train", data_dir: str = "bandhan_ml/Data_test") -> pd.DataFrame:
    df = load_split_data(split=split, data_dir=data_dir)
    _, _, _, _, _, df_proc = preprocess_features(df)
    return df_proc


if __name__ == "__main__":
    train_df = load_split_data("train")
    X_train, y_m1, y_m2, y_m3, encoders, df_proc = preprocess_features(train_df)
    print(f"[FEATURE PIPELINE] Processed train set: X shape = {X_train.shape}")
    print(f"  - M1 High Safety Risk positive ratio: {y_m1.mean()*100:.2f}%")
    print(f"  - M2 Duration mean: {y_m2.mean():.2f} hours (p50={y_m2.median():.2f}, p90={y_m2.quantile(0.90):.2f})")
    print(f"  - M3 Priority mean: {y_m3.mean():.2f}/100")
