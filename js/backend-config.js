(function (window) {
  'use strict';

  const DEFAULT_API_BASE_URL =
    'https://kim-customs-pharmacy-leonard.trycloudflare.com ';

  function normalizeBaseUrl(value) {
    const raw = String(value || DEFAULT_API_BASE_URL).trim();
    return raw.replace(/\/+$/, '');
  }

  const BackendConfig = {
    baseUrl: normalizeBaseUrl(DEFAULT_API_BASE_URL),

    endpoint(path) {
      return this.baseUrl + '/' + String(path || '').replace(/^\/+/, '');
    },

    setBaseUrl(url) {
      this.baseUrl = normalizeBaseUrl(url);
      return this.baseUrl;
    }
  };

  window.BackendConfig = BackendConfig;
})(window);
