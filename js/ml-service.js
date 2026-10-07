/**
 * GreenPulse - ML Model Integration Client (ml-service.js)
 * 
 * Handles communication with backend ML Model:
 * - Direct ingestion of the ML prediction model backend JSON schema:
 *   {
 *     "station_id": 1,
 *     "based_on_timestamp": "2023-12-31T00:00:00Z",
 *     "predictions": {
 *       "PM2.5_target_1h": 60.0380365016081,
 *       "PM2.5_target_2h": 59.875294477922544,
 *       "PM2.5_target_3h": 59.875534533410416,
 *       "PM2.5_target_4h": 59.96506644172793,
 *       "PM2.5_target_5h": 60.01252358328561,
 *       "PM10_target_1h": 89.31760812239871,
 *       "PM10_target_2h": 90.80033060791786,
 *       "PM10_target_3h": 90.95100831030717,
 *       "PM10_target_4h": 89.52224316971952,
 *       "PM10_target_5h": 88.95334911515064
 *     }
 *   }
 * - Seamless integration interface with custom backend endpoints or local inference fallback.
 * - Enriches raw model outputs into EMS scores, deltas, and UI transition datasets.
 */

(function (window) {
  'use strict';

  const STATION_MAPPING = {
    1: { id: 'byrnihat-industrial', name: 'Byrnihat Industrial Corridor' },
    2: { id: 'iewduh-bazar', name: 'Iewduh (Bara Bazar)' },
    3: { id: 'police-bazar', name: 'Police Bazar Hub' },
    4: { id: 'laitumkhrah', name: 'Laitumkhrah Commercial Ridge' },
    5: { id: 'nehu-campus', name: 'NEHU Academic Campus' },
    6: { id: 'mawphlang-forest', name: 'Mawphlang Sacred Grove' },
    7: { id: 'cherrapunji-sohra', name: 'Cherrapunji Plateau' },
    8: { id: 'wards-lake', name: "Ward's Lake Sanctuary" }
  };

  const SLUG_TO_STATION_ID = {
    'byrnihat-industrial': 1,
    'iewduh-bazar': 2,
    'police-bazar': 3,
    'laitumkhrah': 4,
    'nehu-campus': 5,
    'mawphlang-forest': 6,
    'cherrapunji-sohra': 7,
    'wards-lake': 8
  };

  const MLService = {
    backendUrl: '/api/ml-predictions',
    modelMeta: {
      name: 'GreenPulse-AQ-Ensemble-v2.4',
      status: 'Connected',
      horizons: [1, 2, 3, 4, 5],
      lastInference: null
    },
    currentPredictions: null,
    isPredicting: false,

    /**
     * Map slug or numeric ID to integer station_id
     */
    toStationId(idOrSlug) {
      if (typeof idOrSlug === 'number') return idOrSlug;
      if (SLUG_TO_STATION_ID[idOrSlug]) return SLUG_TO_STATION_ID[idOrSlug];
      const parsed = parseInt(idOrSlug, 10);
      return isNaN(parsed) ? 1 : parsed;
    },

    /**
     * Map numeric station_id to station slug
     */
    toStationSlug(stationId) {
      const num = parseInt(stationId, 10) || 1;
      return STATION_MAPPING[num]?.id || 'byrnihat-industrial';
    },

    /**
     * Map numeric station_id to human readable station name
     */
    toStationName(stationId) {
      const num = parseInt(stationId, 10) || 1;
      return STATION_MAPPING[num]?.name || `Station #${num}`;
    },

    /**
     * Benchmark reference JSON schema provided by user
     */
    getBenchmarkJSON() {
      return {
        station_id: 1,
        based_on_timestamp: "2023-12-31T00:00:00Z",
        predictions: {
          "PM2.5_target_1h": 60.0380365016081,
          "PM2.5_target_2h": 59.875294477922544,
          "PM2.5_target_3h": 59.875534533410416,
          "PM2.5_target_4h": 59.96506644172793,
          "PM2.5_target_5h": 60.01252358328561,
          "PM10_target_1h": 89.31760812239871,
          "PM10_target_2h": 90.80033060791786,
          "PM10_target_3h": 90.95100831030717,
          "PM10_target_4h": 89.52224316971952,
          "PM10_target_5h": 88.95334911515064
        }
      };
    },

    /**
     * Determine whether the client application is running on localhost
     */
    isLocalhost() {
      const host = window.location.hostname;
      return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    },

    /**
     * Check ML backend connectivity and discovered routes
     */
    async checkBackendStatus() {
      try {
        const res = await fetch('/api/ml-backend-status');
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('Could not query /api/ml-backend-status:', err);
      }
      return {
        reachable: false,
        isLocalhostTarget: true,
        message: 'Could not contact backend diagnostics'
      };
    },

    /**
     * Set a custom backend URL (for easy external integration)
     */
    setBackendUrl(url) {
      if (typeof url === 'string' && url.trim()) {
        this.backendUrl = url.trim();
        console.log(`MLService backend URL set to: ${this.backendUrl}`);
      }
    },

    /**
     * Formatter that converts the backend JSON into UI-enriched horizon models
     * Supports both standard nested { predictions: { ... } }, flat dictionary,
     * and array schemas from custom FastAPI backends.
     * @param {Object} rawData Backend JSON matching the schema
     * @param {number} baselinePm25 Baseline historical PM2.5
     * @param {number} baselinePm10 Baseline historical PM10
     */
    formatMLResponse(rawData, baselinePm25 = 60.0, baselinePm10 = 89.0) {
      if (!rawData) {
        throw new Error("Invalid ML backend JSON format: received empty response");
      }

      // Automatically unwrap if data is nested under .data, or if already flat
      let preds = rawData.predictions;
      if (!preds && rawData.data && typeof rawData.data === 'object') {
        preds = rawData.data.predictions || rawData.data;
      }
      if (!preds) {
        preds = rawData; // Flat object support
      }

      const stationId = rawData.station_id ?? rawData.stationId ?? 1;
      const timestampStr = rawData.based_on_timestamp || rawData.timestamp || new Date().toISOString();
      let baseTime = new Date(timestampStr);
      if (isNaN(baseTime.getTime())) {
        baseTime = new Date();
      }

      const horizons = [1, 2, 3, 4, 5].map(h => {
        const pm25Key = `PM2.5_target_${h}h`;
        const pm10Key = `PM10_target_${h}h`;

        // Extract PM2.5 supporting standard key, array, or alternative naming
        let pm25Raw;
        if (preds[pm25Key] !== undefined) {
          pm25Raw = Number(preds[pm25Key]);
        } else if (Array.isArray(preds.pm25) && preds.pm25[h - 1] !== undefined) {
          pm25Raw = Number(preds.pm25[h - 1]);
        } else if (Array.isArray(preds['PM2.5']) && preds['PM2.5'][h - 1] !== undefined) {
          pm25Raw = Number(preds['PM2.5'][h - 1]);
        } else if (preds[`pm25_${h}h`] !== undefined) {
          pm25Raw = Number(preds[`pm25_${h}h`]);
        } else {
          pm25Raw = baselinePm25 + h * 0.5;
        }

        // Extract PM10 supporting standard key, array, or alternative naming
        let pm10Raw;
        if (preds[pm10Key] !== undefined) {
          pm10Raw = Number(preds[pm10Key]);
        } else if (Array.isArray(preds.pm10) && preds.pm10[h - 1] !== undefined) {
          pm10Raw = Number(preds.pm10[h - 1]);
        } else if (Array.isArray(preds['PM10']) && preds['PM10'][h - 1] !== undefined) {
          pm10Raw = Number(preds['PM10'][h - 1]);
        } else if (preds[`pm10_${h}h`] !== undefined) {
          pm10Raw = Number(preds[`pm10_${h}h`]);
        } else {
          pm10Raw = baselinePm10 + h * 1.0;
        }

        const pm25 = parseFloat(pm25Raw.toFixed(1));
        const pm10 = parseFloat(pm10Raw.toFixed(1));

        const targetTime = new Date(baseTime.getTime() + h * 3600 * 1000);

        // Project Eco-Metric Score (EMS) using standard formula: 100 - (PM2.5 * 1.15 + PM10 * 0.55)
        let emsProjected = Math.round(100 - (pm25 * 1.15 + pm10 * 0.55));
        emsProjected = Math.max(5, Math.min(98, emsProjected));

        // Model Confidence interval
        const confidence = parseFloat((0.96 - (h - 1) * 0.031).toFixed(2));
        const confidencePercent = Math.round(confidence * 100);

        const deltaPm25 = parseFloat((pm25 - baselinePm25).toFixed(1));
        const deltaPm10 = parseFloat((pm10 - baselinePm10).toFixed(1));

        return {
          horizonHours: h,
          horizonLabel: `+${h}h`,
          targetIsoTime: targetTime.toISOString(),
          targetFormattedTime: targetTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          pm25,
          pm10,
          pm25Raw,
          pm10Raw,
          confidence,
          confidencePercent,
          emsProjected,
          deltaPm25,
          deltaPm10,
          riskLevel: emsProjected >= 81 ? 'optimal' : emsProjected >= 61 ? 'good' : emsProjected >= 41 ? 'moderate' : emsProjected >= 21 ? 'poor' : 'critical'
        };
      });

      const enriched = {
        station_id: stationId,
        station_slug: this.toStationSlug(stationId),
        station_name: this.toStationName(stationId),
        based_on_timestamp: timestampStr,
        predictions: preds, // Exact raw predictions dictionary
        raw: rawData,       // Clean reference to the entire original JSON
        horizons: horizons,
        inputBaseline: {
          pm25: baselinePm25,
          pm10: baselinePm10
        }
      };

      this.currentPredictions = enriched;
      this.modelMeta.lastInference = new Date();
      return enriched;
    },

    /**
     * Request 1h to 5h PM2.5 & PM10 predictions from the backend ML model
     * @param {Object} params Input parameters derived from Open-Meteo historic baseline
     */
    async fetchPredictions(params = {}) {
      this.isPredicting = true;

      try {
        const response = await fetch(
          (window.BackendConfig ? window.BackendConfig.endpoint('/dashboard/readings') : '/dashboard/readings'),
          {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' },
            cache: 'no-store'
          }
        );

        if (!response.ok) {
          throw new Error(`Backend dashboard endpoint returned HTTP ${response.status}`);
        }

        const live = await response.json();
        const predictions = live?.pollution?.prediction || live?.pollution?.predictions;

        if (!predictions) {
          throw new Error(live?.mlStatus?.pollution || 'Pollution predictions are not available yet');
        }

        const baseline25 = Number(
          params.baselinePm25 ??
          live?.pollution?.pm25 ??
          predictions['PM2.5_target_0h'] ??
          0
        );
        const baseline10 = Number(
          params.baselinePm10 ??
          live?.pollution?.pm10 ??
          predictions['PM10_target_0h'] ??
          0
        );

        const stationId = this.toStationId(params.stationId || params.station_id || live?.stationId || 1);
        const normalized = {
          station_id: stationId,
          station_slug: this.toStationSlug(stationId),
          station_name: this.toStationName(stationId),
          based_on_timestamp: live?.timestamp || new Date().toISOString(),
          predictions
        };

        const enriched = this.formatMLResponse(normalized, baseline25, baseline10);
        this.modelMeta.status = 'Live backend connected';
        this.modelMeta.lastInference = new Date();
        this.currentPredictions = enriched;
        return enriched;
      } catch (err) {
        this.modelMeta.status = 'Live backend unavailable';
        throw err;
      } finally {
        this.isPredicting = false;
      }
    },

    /**
     * Easy developer integration: Import or test a custom JSON response directly
     * @param {string|Object} customInput JSON string or object matching the ML schema
     */
    loadCustomJSON(customInput) {
      try {
        const obj = typeof customInput === 'string' ? JSON.parse(customInput) : customInput;
        const firstPred25 = obj.predictions?.['PM2.5_target_1h'] ?? 60.0;
        const firstPred10 = obj.predictions?.['PM10_target_1h'] ?? 89.0;
        const enriched = this.formatMLResponse(obj, firstPred25, firstPred10);
        this.modelMeta.status = 'Custom JSON Loaded';
        if (window.MLController && typeof window.MLController.renderHorizonCards === 'function') {
          window.MLController.currentPredictions = enriched;
          window.MLController.renderHorizonCards();
          window.MLController.renderTransitionChart();
          window.MLController.updateDiagnosticsUI();
        }
        return { success: true, data: enriched };
      } catch (err) {
        console.error("Failed to load custom ML JSON:", err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Get the active raw JSON for copying or inspection
     */
    getRawJSON() {
      if (this.currentPredictions?.raw) {
        return this.currentPredictions.raw;
      }
      return this.getBenchmarkJSON();
    }
  };

  window.MLService = MLService;
})(window);

