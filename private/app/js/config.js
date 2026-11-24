// Centralized API Base URL helper for Havilah frontend
const API_BASE_URL = window.__HAVILAH_BACKEND_URL__
  ? window.__HAVILAH_BACKEND_URL__
  : ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : window.location.origin);

window.API_BASE_URL = API_BASE_URL;
