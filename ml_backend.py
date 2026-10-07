"""
GreenPulse ML Backend Microservice (FastAPI)
=============================================
This is a reference Python ML backend for the GreenPulse Air Quality Platform.

To run this backend:
1. Install dependencies:
   pip install fastapi uvicorn pydantic

2. Start the FastAPI server on port 8000:
   uvicorn ml_backend:app --host 127.0.0.1 --port 8000 --reload
   (or simply: python ml_backend.py)

3. View Swagger API Docs at:
   http://127.0.0.1:8000/docs
"""

import sys
from datetime import datetime
from typing import Optional, Dict, Any

try:
    from fastapi import FastAPI, Query
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
except ImportError:
    print("Please install requirements: pip install fastapi uvicorn pydantic")
    sys.exit(1)

app = FastAPI(
    title="GreenPulse Air Quality ML Model",
    description="PM2.5 and PM10 1h-5h multi-horizon forecasting microservice",
    version="1.0.0",
    docs_url="/docs"
)

# Enable CORS for seamless cross-origin browser and localhost communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PredictionInput(BaseModel):
    station_id: Optional[int] = 1
    stationId: Optional[int] = 1
    baselinePm25: Optional[float] = 60.0
    baselinePm10: Optional[float] = 89.0
    pm25: Optional[float] = None
    pm10: Optional[float] = None
    recentPrecipitation: Optional[float] = 0.0
    trafficFactor: Optional[float] = 1.0
    rainSimulationMm: Optional[float] = 0.0
    windDispersion: Optional[float] = 1.0
    based_on_timestamp: Optional[str] = None

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "GreenPulse ML Backend",
        "docs": "http://127.0.0.1:8000/docs",
        "endpoints": ["/predict", "/predictions", "/health"]
    }

@app.get("/health")
def health():
    return {"status": "ok", "service": "GreenPulse ML Model", "timestamp": datetime.utcnow().isoformat() + "Z"}

@app.post("/predict")
@app.post("/predictions")
def predict_post(payload: PredictionInput):
    """
    POST Endpoint: Receives current station baseline and environmental factors.
    Returns 1-hour through 5-hour multi-horizon predictions for PM2.5 and PM10.
    """
    return generate_ml_predictions(payload)

@app.get("/predict")
def predict_get(
    station_id: int = 1,
    baselinePm25: float = 60.0,
    baselinePm10: float = 89.0,
    rainSimulationMm: float = 0.0,
    trafficFactor: float = 1.0,
    windDispersion: float = 1.0
):
    """GET Endpoint alternative for quick browser URL testing"""
    payload = PredictionInput(
        station_id=station_id,
        baselinePm25=baselinePm25,
        baselinePm10=baselinePm10,
        rainSimulationMm=rainSimulationMm,
        trafficFactor=trafficFactor,
        windDispersion=windDispersion
    )
    return generate_ml_predictions(payload)

def generate_ml_predictions(payload: PredictionInput) -> Dict[str, Any]:
    """
    ML prediction logic: Plug your trained Scikit-learn, XGBoost, PyTorch,
    or TensorFlow model inference here!
    """
    pm25_base = payload.baselinePm25 or payload.pm25 or 60.0
    pm10_base = payload.baselinePm10 or payload.pm10 or 89.0
    rain = (payload.rainSimulationMm or 0.0) + (payload.recentPrecipitation or 0.0)
    traffic = payload.trafficFactor or 1.0
    wind = payload.windDispersion or 1.0

    # Atmospheric washout and wind dispersion physical modelling
    washout = min(rain * 0.14, 0.5)
    dispersion = 1.0 / max(0.5, wind)

    predictions: Dict[str, float] = {}
    for h in [1, 2, 3, 4, 5]:
        trend_pm25 = ((h - 1) * 0.45 * traffic * dispersion) - (washout * pm25_base * 0.08)
        trend_pm10 = ((h - 1) * 0.65 * traffic * dispersion) - (washout * pm10_base * 0.10)
        predictions[f"PM2.5_target_{h}h"] = round(float(pm25_base + trend_pm25), 3)
        predictions[f"PM10_target_{h}h"] = round(float(pm10_base + trend_pm10), 3)

    return {
        "station_id": payload.station_id or payload.stationId or 1,
        "based_on_timestamp": payload.based_on_timestamp or datetime.utcnow().isoformat() + "Z",
        "predictions": predictions
    }

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting GreenPulse ML Backend on http://127.0.0.1:8000 ...")
    print("📖 Swagger Docs available at http://127.0.0.1:8000/docs")
    uvicorn.run("ml_backend:app", host="127.0.0.1", port=8000, reload=True)
