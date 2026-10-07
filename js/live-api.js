(function (window) {
  'use strict';

  const POLL_INTERVAL_MS = 5000;

  const LiveAPI = {
    timer: null,
    inFlight: false,
    listeners: new Set(),
    latest: null,

    getUrl() {
      if (!window.BackendConfig) {
        throw new Error('BackendConfig is not loaded');
      }
      return window.BackendConfig.endpoint('/dashboard/readings');
    },

    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    },

    emit(payload) {
      this.latest = payload;
      this.listeners.forEach((listener) => {
        try {
          listener(payload);
        } catch (error) {
          console.warn('Live API listener failed:', error);
        }
      });
    },

    async fetchLatest() {
      if (this.inFlight) return this.latest;
      this.inFlight = true;

      try {
        const response = await fetch(this.getUrl(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          },
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`Backend returned HTTP ${response.status}`);
        }

        const payload = await response.json();
        this.emit(payload);
        return payload;
      } finally {
        this.inFlight = false;
      }
    },

    start() {
      this.stop();

      // First request immediately.
      this.fetchLatest().catch((error) => {
        console.warn('Initial GreenPulse backend request failed:', error);
        this.emit({
          error: true,
          errorMessage: error.message,
          timestamp: new Date().toISOString()
        });
      });

      this.timer = window.setInterval(() => {
        this.fetchLatest().catch((error) => {
          console.warn('GreenPulse polling request failed:', error);
        });
      }, POLL_INTERVAL_MS);
    },

    stop() {
      if (this.timer) {
        window.clearInterval(this.timer);
        this.timer = null;
      }
    }
  };

  window.LiveAPI = LiveAPI;
})(window);
