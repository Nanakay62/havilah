// Centralized API Base URL helper for Havilah frontend
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:5000'
  : 'https://havilah-api.onrender.com';

window.API_BASE_URL = API_BASE_URL;
