import "dotenv/config";

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

/**
 * Call the real FastAPI ML backend.
 *
 * GreenPulse:
 *   POST /api/ml-predictions
 *
 * FastAPI:
 *   POST /predict/1
 *
 * The FastAPI endpoint loads the trained Random Forest model
 * and returns the PM2.5 / PM10 predictions.
 */
async function callExternalMLBackend(
  targetUrl: string
): Promise<{
  success: boolean;
  data?: any;
  endpoint?: string;
  error?: string;
}> {
  try {
    const rawTarget = targetUrl.trim();

    // Remove /docs, /redoc and trailing slash if present.
    const cleanBase = rawTarget
      .replace(/\/docs\/?$/, "")
      .replace(/\/redoc\/?$/, "")
      .replace(/\/$/, "");

    // Station 1 is the currently configured ML station.
    const endpoint = `${cleanBase}/predict/1`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },

        // Your FastAPI /predict/1 endpoint successfully accepts {}.
        body: JSON.stringify({}),

        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          success: false,
          error: `ML backend returned HTTP ${response.status}`,
        };
      }

      const json = await response.json();

      console.log(
        `[ML Proxy] Successfully received response from ML backend at: ${endpoint}`
      );

      return {
        success: true,
        data: json,
        endpoint,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to reach ML backend",
    };
  }
}

async function startServer() {
  const app = express();

  const PORT = 3000;

  // ------------------------------------------------------------
  // CORS
  // ------------------------------------------------------------

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });

  app.use(express.json());

  // ------------------------------------------------------------
  // API HEALTH CHECK
  // ------------------------------------------------------------

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "GreenPulse Environmental Backend",
      timestamp: new Date().toISOString(),
      isLocalhost: true,
    });
  });

  // ------------------------------------------------------------
  // ML BACKEND STATUS
  // ------------------------------------------------------------

  app.get("/api/ml-backend-status", async (req, res) => {
    const target =
      process.env.ML_BACKEND_URL ||
      "http://127.0.0.1:8000";

    const cleanBase = target
      .trim()
      .replace(/\/docs\/?$/, "")
      .replace(/\/redoc\/?$/, "")
      .replace(/\/$/, "");

    const isCloudContainer =
      req.hostname.includes("run.app") ||
      req.hostname.includes("cloud");

    const status: {
      configuredUrl: string;
      cleanBaseUrl: string;
      predictionEndpoint: string;
      isLocalhostTarget: boolean;
      isCloudContainer: boolean;
      reachable: boolean;
      predictionEndpointWorking: boolean;
      message: string;
    } = {
      configuredUrl: target,
      cleanBaseUrl: cleanBase,
      predictionEndpoint: `${cleanBase}/predict/1`,
      isLocalhostTarget:
        cleanBase.includes("127.0.0.1") ||
        cleanBase.includes("localhost"),
      isCloudContainer,
      reachable: false,
      predictionEndpointWorking: false,
      message: "",
    };

    // Check whether FastAPI itself is reachable.
    try {
      const openApiProbe = await fetch(
        `${cleanBase}/openapi.json`,
        {
          signal: AbortSignal.timeout(1800),
        }
      );

      if (openApiProbe.ok) {
        status.reachable = true;
      }
    } catch {
      // Continue below.
    }

    // Check the actual prediction endpoint.
    try {
      const predictionProbe = await fetch(
        `${cleanBase}/predict/1`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(4000),
        }
      );

      if (predictionProbe.ok) {
        status.predictionEndpointWorking = true;
        status.reachable = true;

        status.message =
          `FastAPI ML backend is active at ${cleanBase}. ` +
          `Prediction endpoint /predict/1 is working.`;

        return res.json(status);
      }

      status.message =
        `FastAPI is reachable at ${cleanBase}, but /predict/1 ` +
        `returned HTTP ${predictionProbe.status}.`;

      return res.json(status);
    } catch (err: any) {
      if (status.isLocalhostTarget && isCloudContainer) {
        status.message =
          `Target is ${cleanBase}. In the cloud container preview, ` +
          `the backend on your personal machine cannot be reached. ` +
          `Run GreenPulse locally on localhost:3000.`;
      } else {
        status.message =
          `Cannot reach ML backend at ${cleanBase}. ` +
          `Make sure FastAPI is running on port 8000. ` +
          `Error: ${err.message || "Connection refused"}`;
      }

      return res.json(status);
    }
  });

  // ------------------------------------------------------------
  // REAL ML PREDICTION ENDPOINT
  // ------------------------------------------------------------

  app.post("/api/ml-predictions", async (req, res) => {
    try {
      const mlBackendUrl =
        process.env.ML_BACKEND_URL ||
        "http://127.0.0.1:8000";

      const result = await callExternalMLBackend(
        mlBackendUrl
      );

      if (result.success && result.data) {
        /*
         * FastAPI currently returns:
         *
         * {
         *   "station_id": 1,
         *   "based_on_timestamp": "...",
         *   "predictions": {
         *     "PM2.5_target_1h": ...,
         *     "PM2.5_target_2h": ...,
         *     ...
         *     "PM10_target_5h": ...
         *   }
         * }
         */

        const finalData =
          result.data.predictions
            ? result.data
            : result.data.data?.predictions
              ? result.data.data
              : result.data;

        return res.json(finalData);
      }

      console.error(
        `[ML Proxy] Real ML backend failed: ${result.error}`
      );

      /*
       * IMPORTANT:
       *
       * There is intentionally NO JavaScript fake-ML fallback here.
       *
       * If FastAPI fails, GreenPulse reports an error instead of
       * silently generating mathematical demo predictions.
       */
      return res.status(502).json({
        error: "ML backend unavailable",
        details: result.error,
      });
    } catch (err: any) {
      console.error(
        "[ML Proxy] ML Prediction Error:",
        err
      );

      return res.status(500).json({
        error: "Failed to contact ML backend",
        message: err.message,
      });
    }
  });

  // ------------------------------------------------------------
  // VITE
  // ------------------------------------------------------------

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
      },
      appType: "spa",
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(
      process.cwd(),
      "dist"
    );

    app.use(express.static(distPath));

    app.get("*", (_req, res) => {
      res.sendFile(
        path.join(distPath, "index.html")
      );
    });
  }

  // ------------------------------------------------------------
  // START SERVER
  // ------------------------------------------------------------

  app.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        `GreenPulse Server running on http://localhost:${PORT}`
      );

      console.log(
        `ML backend target: ${
          process.env.ML_BACKEND_URL ||
          "http://127.0.0.1:8000"
        }`
      );

      console.log(
        `ML prediction endpoint: ${
          process.env.ML_BACKEND_URL ||
          "http://127.0.0.1:8000"
        }/predict/1`
      );
    }
  );
}

startServer();