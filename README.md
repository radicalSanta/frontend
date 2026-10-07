# GreenPulse — AI Air Quality Monitoring & ML Ensemble Platform

GreenPulse is a full-stack environmental intelligence platform with real-time sensor analytics, geospatial monitoring, weather simulation, and 1h–5h PM2.5 / PM10 machine learning forecasting.

---

## 🚀 Running the Frontend and ML Server Locally

You do **not** need to create or `cd` into any special subfolder. Simply open your terminal in this repository folder (where `package.json` and `ml_backend.py` are located).

---

### Step 1: Start your ML Backend (Terminal 1 — Port 8000)

If you already have your own FastAPI file:
```bash
uvicorn <your_script_name>:app --host 127.0.0.1 --port 8000 --reload
```

*Or, you can use the included `ml_backend.py` reference server:*
```bash
pip install fastapi uvicorn pydantic
python ml_backend.py
```
> Verify it is running by opening: **`http://127.0.0.1:8000/docs`**

---

### Step 2: Start the Web Application (Terminal 2 — Port 3000)

In a second terminal in the same folder:
```bash
npm install
npm run dev
```
> Open your browser to: **`http://localhost:3000`**

---

## ⚡ How Flawless Communication Works

1. **Zero CORS Issues (Automated Server Proxy)**:
   - When viewing `http://localhost:3000`, the frontend sends requests to `/api/ml-predictions`.
   - The local Express server proxies this directly to `http://127.0.0.1:8000/predict` on your machine.
   - Because this request is server-to-server, browser cross-origin (CORS) security blocks never trigger.

2. **Smart FastAPI Route Detection**:
   - Even if you provide `http://127.0.0.1:8000/docs`, the server automatically queries `http://127.0.0.1:8000/openapi.json` to discover whatever prediction routes you declared (e.g. `/predict`, `/predictions`).

3. **Flexible Schema Adaptation**:
   - The frontend accepts any of the following response formats from your model:
     - **Nested (Standard)**: `{"station_id": 1, "predictions": {"PM2.5_target_1h": 60.1, ...}}`
     - **Flat**: `{"PM2.5_target_1h": 60.1, "PM10_target_1h": 89.2, ...}`
     - **Arrays**: `{"pm25": [60.1, 59.8, 59.9, 60.0, 60.2], "pm10": [89.3, 90.8, 91.0, 89.5, 88.9]}`


---

## 🔗 Connecting to your Local ML Backend (`http://127.0.0.1:8000`)

When running on localhost, the GreenPulse Express server automatically proxies all prediction requests from `http://localhost:3000/api/ml-predictions` directly to your local FastAPI service at `http://127.0.0.1:8000`.

### Environment Variable (`.env`)
```env
# Your local FastAPI Swagger or endpoint URL:
ML_BACKEND_URL="http://127.0.0.1:8000/docs"
```

The built-in intelligent endpoint resolver automatically:
1. Strips `/docs` or `/redoc` to locate your base server (`http://127.0.0.1:8000`).
2. Checks `/openapi.json` to discover your declared `POST` prediction route (e.g. `/predict`, `/predictions`).
3. Dispatches the baseline sensor readings and meteorological parameters.
4. Renders the 5-horizon trajectory directly into the interactive charts and EMS score cards.

---

## 🐍 FastAPI Integration Example

If your local ML backend is built with **FastAPI**, here is the recommended setup:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="GreenPulse ML Backend", docs_url="/docs")

# Enable CORS for local cross-origin development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PredictionRequest(BaseModel):
    station_id: Optional[int] = 1
    baselinePm25: Optional[float] = 60.0
    baselinePm10: Optional[float] = 89.0
    based_on_timestamp: Optional[str] = None
    rainSimulationMm: Optional[float] = 0.0
    trafficFactor: Optional[float] = 1.0
    windDispersion: Optional[float] = 1.0

@app.post("/predict")
def predict(data: PredictionRequest):
    # Your trained model inference logic here:
    return {
        "station_id": data.station_id,
        "based_on_timestamp": data.based_on_timestamp or "2023-12-31T00:00:00Z",
        "predictions": {
            "PM2.5_target_1h": 60.038,
            "PM2.5_target_2h": 59.875,
            "PM2.5_target_3h": 59.875,
            "PM2.5_target_4h": 59.965,
            "PM2.5_target_5h": 60.012,
            "PM10_target_1h": 89.317,
            "PM10_target_2h": 90.800,
            "PM10_target_3h": 90.951,
            "PM10_target_4h": 89.522,
            "PM10_target_5h": 88.953
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
```

---

## 🧪 Testing the Connection

1. Start your FastAPI server:
   ```bash
   uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```
2. Open `http://localhost:3000` in your browser.
3. Navigate to **ML Predictions** tab.
4. Click **"Test Connection"** or **"Re-Run ML Model"** — the live predictions will instantly populate from your local Python model.
