import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline

try:
    from ml.synthetic_data import generate_synthetic_demand_data
except ImportError:
    from synthetic_data import generate_synthetic_demand_data

def train_and_evaluate():
    print("[ML] Generating synthetic chronological emergency request dataset...")
    df = generate_synthetic_demand_data(n_days=150)
    
    # Chronological Split (Earlier 80% dates for training, Later 20% dates for testing)
    unique_dates = sorted(df["date"].unique())
    split_idx = int(len(unique_dates) * 0.8)
    split_date = unique_dates[split_idx]
    
    train_df = df[df["date"] < split_date].copy()
    test_df = df[df["date"] >= split_date].copy()
    
    print(f"[ML] Chronological Split Date: {split_date}")
    print(f"[ML] Training samples: {len(train_df)} | Test samples: {len(test_df)}")
    
    # 1. Baseline Model: Historical moving average per (zone_id, supply_id)
    baseline_lookup = train_df.groupby(["zone_id", "supply_id"])["requested_qty"].mean().to_dict()
    global_mean = train_df["requested_qty"].mean()
    
    def predict_baseline(row):
        return baseline_lookup.get((row["zone_id"], row["supply_id"]), global_mean)
        
    baseline_preds = test_df.apply(predict_baseline, axis=1)
    baseline_mae = mean_absolute_error(test_df["next_day_demand"], baseline_preds)
    print(f"\n==========================================")
    print(f" BASELINE MODEL EVALUATION")
    print(f" Mean Absolute Error (MAE): {baseline_mae:.2f} units")
    print(f"==========================================")
    
    # 2. Machine Learning Pipeline (Random Forest Regressor)
    feature_cols = ["zone_id", "supply_id", "severity", "affected_households", "past_demand_avg"]
    categorical_features = ["severity"]
    numeric_features = ["zone_id", "supply_id", "affected_households", "past_demand_avg"]
    
    preprocessor = ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore"), categorical_features),
            ("num", "passthrough", numeric_features)
        ]
    )
    
    model_pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("regressor", RandomForestRegressor(n_estimators=100, max_depth=8, random_state=42))
        ]
    )
    
    X_train = train_df[feature_cols]
    y_train = train_df["next_day_demand"]
    X_test = test_df[feature_cols]
    y_test = test_df["next_day_demand"]
    
    print("\n[ML] Training Random Forest Regressor pipeline...")
    model_pipeline.fit(X_train, y_train)
    
    ml_preds = model_pipeline.predict(X_test)
    ml_mae = mean_absolute_error(y_test, ml_preds)
    
    improvement = ((baseline_mae - ml_mae) / baseline_mae) * 100.0
    print(f"\n==========================================")
    print(f" MACHINE LEARNING MODEL EVALUATION")
    print(f" Model: RandomForestRegressor (Scikit-Learn)")
    print(f" Test MAE: {ml_mae:.2f} units")
    print(f" Improvement over Baseline: {improvement:.1f}%")
    print(f"==========================================")
    
    # Save Model Artifact
    output_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(output_dir, "model.joblib")
    
    artifact = {
        "pipeline": model_pipeline,
        "feature_cols": feature_cols,
        "baseline_mae": float(baseline_mae),
        "ml_mae": float(ml_mae),
        "improvement_pct": float(improvement),
        "trained_at": pd.Timestamp.now().isoformat(),
        "evaluation": "chronological_split_80_20"
    }
    
    joblib.dump(artifact, model_path)
    print(f"[ML] Model artifact saved to: {model_path}")
    return artifact

if __name__ == "__main__":
    train_and_evaluate()
