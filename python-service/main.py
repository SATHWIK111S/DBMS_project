import os
import joblib
import pandas as pd
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from image_processing.processor import process_evidence_image

app = FastAPI(
    title="Community Disaster Relief AI & Image Microservice",
    description="FastAPI service providing OpenCV image processing and Scikit-learn demand forecasting for SDG 11",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model artifact
MODEL_PATH = os.path.join(os.path.dirname(__file__), "ml", "model.joblib")
model_artifact = None

def get_model():
    global model_artifact
    if model_artifact is None and os.path.exists(MODEL_PATH):
        try:
            model_artifact = joblib.load(MODEL_PATH)
            print(f"[FastAPI] Loaded ML model trained at {model_artifact.get('trained_at')}")
        except Exception as e:
            print(f"[FastAPI] Failed to load model from {MODEL_PATH}: {e}")
    return model_artifact

class PredictionRequest(BaseModel):
    zone_id: int = Field(..., example=1)
    supply_id: int = Field(..., example=1)
    severity: str = Field(default="HIGH", example="HIGH")
    affected_households: int = Field(default=25, example=25)
    past_demand_avg: float = Field(default=60.0, example=60.0)

class PredictionResponse(BaseModel):
    predicted_quantity: int
    zone_id: int
    supply_id: int
    severity: str
    model_version: str
    mae_benchmark: str
    status: str
    disclaimer: str

@app.get("/health")
def health_check():
    model = get_model()
    return {
        "status": "healthy",
        "service": "Disaster Relief ML & Vision Service",
        "model_loaded": model is not None,
        "model_path": MODEL_PATH
    }

@app.post("/predict", response_model=PredictionResponse)
def predict_demand(req: PredictionRequest):
    """
    Predicts next-day requested quantity based on crisis factors.
    NOTE: All AI outputs are strictly advisory. Staff approve all allocations.
    """
    model = get_model()
    
    if model is not None:
        try:
            pipeline = model["pipeline"]
            input_df = pd.DataFrame([{
                "zone_id": req.zone_id,
                "supply_id": req.supply_id,
                "severity": req.severity.upper(),
                "affected_households": req.affected_households,
                "past_demand_avg": req.past_demand_avg
            }])
            raw_pred = pipeline.predict(input_df)[0]
            predicted_qty = max(1, int(round(raw_pred)))
            mae_str = f"{model.get('ml_mae', 4.15):.2f} units"
            version_str = "RandomForestRegressor-v1"
        except Exception as e:
            # Fallback heuristic
            print(f"[Predict Error] {e}. Using robust heuristic calculation.")
            sev_mult = {"LOW": 1.0, "MEDIUM": 1.25, "HIGH": 1.5, "CRITICAL": 1.85}.get(req.severity.upper(), 1.3)
            predicted_qty = int(round((req.affected_households * 3.6 + req.past_demand_avg * 0.4) * sev_mult * 0.5))
            mae_str = "4.50 units"
            version_str = "heuristic-baseline-fallback"
    else:
        sev_mult = {"LOW": 1.0, "MEDIUM": 1.25, "HIGH": 1.5, "CRITICAL": 1.85}.get(req.severity.upper(), 1.3)
        predicted_qty = int(round((req.affected_households * 3.6 + req.past_demand_avg * 0.4) * sev_mult * 0.5))
        mae_str = "4.50 units"
        version_str = "heuristic-baseline-fallback"

    return PredictionResponse(
        predicted_quantity=predicted_qty,
        zone_id=req.zone_id,
        supply_id=req.supply_id,
        severity=req.severity,
        model_version=version_str,
        mae_benchmark=mae_str,
        status="advisory",
        disclaimer="Demo Estimate - Staff approval required"
    )

@app.post("/api/images/process")
async def process_image(file: UploadFile = File(...)):
    """
    Validates uploaded disaster evidence photo, corrects orientation via EXIF,
    and generates thumbnail using OpenCV.
    """
    try:
        content = await file.read()
        result = process_evidence_image(content)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image processing error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
