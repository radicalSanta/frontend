(function (window) {
  'use strict';

  const state = {
    latest: null
  };

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function number(value, fallback = '--') {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function updateSimpleCards(data) {
    const sensors = data?.sensors || {};
    const pollution = data?.pollution || {};
    const ems = data?.ems || {};

    setText('val-temp', sensors.temperature != null ? `${number(sensors.temperature)}°C` : '--');
    setText('val-humidity', sensors.humidity != null ? `${number(sensors.humidity)}%` : '--');
    setText('val-soil', sensors.soil != null ? `${number(sensors.soil)} / 100` : '--');
    setText('val-noise', sensors.sound != null ? `${number(sensors.sound)} dB` : '--');
    setText('val-light', sensors.pir != null ? `${number(sensors.pir)} / 100` : '--');
    setText('val-co2', sensors.co2 != null ? `${number(sensors.co2)} ppm` : '--');

    const aqi = data?.environmental_context?.aqi ?? pollution?.aqi;
    setText('val-airquality', aqi != null ? `${number(aqi)} / 100` : '--');
    setText(
      'val-aqi-sub',
      aqi != null && pollution?.pm25 != null
        ? `AQI ${number(aqi)} • PM2.5 ${number(pollution.pm25)} µg/m³`
        : (aqi != null ? `AQI ${number(aqi)}` : '--')
    );

    const score =
      data?.environmentalMonitoringScore ??
      ems?.score;

    if (score != null) {
      setText('ems-score-value', number(score));

      const emsColor = window.EMSColors
        ? window.EMSColors.getColor(Number(score))
        : null;

      const ring = document.getElementById('ems-gauge-circle');
      if (ring && emsColor) {
        ring.style.stroke = emsColor;
        ring.style.strokeDashoffset = 264 - (264 * Number(score)) / 100;
      }

      const fill = document.getElementById('ems-progress-fill');
      if (fill && emsColor) {
        fill.style.width = `${Math.min(100, Math.max(0, Number(score)))}%`;
        fill.style.backgroundColor = emsColor;
      }
    }

    const rainfall = data?.rainfall || {};
    setText('val-rainfall-current', rainfall['1h'] != null ? `${number(rainfall['1h'])} mm/h` : '--');
    setText('val-rainfall-1h', rainfall['1h'] != null ? `${number(rainfall['1h'])} mm` : '--');
    setText('val-rainfall-24h', rainfall['24h'] != null ? `${number(rainfall['24h'])} mm` : '--');

    const timestamp = data?.timestamp;
    if (timestamp) {
      const dt = new Date(timestamp);
      setText(
        'topbar-last-updated',
        Number.isNaN(dt.getTime())
          ? String(timestamp)
          : `Updated ${dt.toLocaleTimeString('en-IN', { hour12: false })}`
      );
    }
  }

  function updateML(data) {
    const horizons = data?.pollution?.prediction || data?.pollution?.predictions;
    if (!horizons) return;

    const normalized = {
      station_id: 1,
      based_on_timestamp: data.timestamp || new Date().toISOString(),
      predictions: horizons
    };

    if (window.MLService) {
      try {
        window.MLService.formatMLResponse(normalized);
      } catch (error) {
        console.warn('Could not format live ML response:', error);
      }
    }
  }

  function updateDiagnostics(data) {
    const pollutionStatus =
      data?.mlStatus?.pollution ??
      (data?.pollution ? 'ok' : 'unavailable');

    const landslideStatus =
      data?.mlStatus?.landslide ??
      (data?.landslide ? 'ok' : 'unavailable');

    setText(
      'ml-backend-status-pill',
      `Pollution: ${pollutionStatus} · Landslide: ${landslideStatus}`
    );
  }

  const LiveDashboard = {
    init() {
      if (!window.LiveAPI) return;

      window.LiveAPI.subscribe((data) => {
        state.latest = data;

        if (data?.error) {
          console.warn('Live dashboard backend error:', data.errorMessage);
          return;
        }

        updateSimpleCards(data);
        updateML(data);
        updateDiagnostics(data);

        window.dispatchEvent(new CustomEvent('greenpulse:live-data', {
          detail: data
        }));
      });

      window.LiveAPI.start();
    }
  };

  window.LiveDashboard = LiveDashboard;
})(window);
