'use strict';

/**
 * Centralized runtime URL, CORS, WebSocket, and notification configuration helper.
 * Keeps all environment resolution in one place so deployments work seamlessly on
 * Cloudflare Workers (`*.workers.dev`) and transition to custom domains via env vars alone.
 */

const DEFAULT_CLIENT_ORIGIN = 'https://havilah.dic20016.workers.dev';
const DEFAULT_API_ORIGIN = 'https://havilah-api.onrender.com';

function splitOriginList(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function isLocalhostOrigin(urlStr) {
  return !urlStr || urlStr.includes('localhost') || urlStr.includes('127.0.0.1');
}

/**
 * Resolves the primary public frontend URL (`APP_BASE_URL`, `PUBLIC_ORIGIN`, `CLIENT_ORIGIN`, etc.),
 * falling back to request Origin/Referer or Cloudflare Worker X-Forwarded headers before DEFAULT_CLIENT_ORIGIN.
 *
 * @param {import('express').Request} [req]
 * @returns {string} Origin without trailing slash
 */
function resolveAppBaseUrl(req) {
  const candidates = [
    process.env.APP_BASE_URL,
    process.env.PUBLIC_ORIGIN,
    process.env.CLIENT_ORIGIN,
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
  ];

  for (const raw of candidates) {
    const origins = splitOriginList(raw);
    const nonLocal = origins.find((o) => !isLocalhostOrigin(o));
    if (nonLocal) return nonLocal;
  }

  if (req && typeof req.get === 'function') {
    const reqOrigin = req.get('origin') || req.get('referer');
    if (reqOrigin && !isLocalhostOrigin(reqOrigin)) {
      try {
        return new URL(reqOrigin).origin;
      } catch (_) {}
    }

    const fwdHost = req.get('x-forwarded-host');
    if (fwdHost && !fwdHost.includes('onrender.com') && !isLocalhostOrigin(fwdHost)) {
      const cleanHost = String(fwdHost).split(',')[0].trim();
      const proto = String(req.get('x-forwarded-proto') || 'https').split(',')[0].trim();
      if (cleanHost) return `${proto}://${cleanHost}`;
    }
  }

  return DEFAULT_CLIENT_ORIGIN;
}

/**
 * Returns the deduplicated list of trusted CORS origins.
 * Supports comma-separated values in ALLOWED_ORIGINS, CLIENT_ORIGIN, APP_BASE_URL, and PUBLIC_ORIGIN.
 */
function getAllowedOrigins() {
  const set = new Set([DEFAULT_CLIENT_ORIGIN]);

  for (const envVar of [
    process.env.ALLOWED_ORIGINS,
    process.env.CLIENT_ORIGIN,
    process.env.APP_BASE_URL,
    process.env.PUBLIC_ORIGIN,
  ]) {
    for (const origin of splitOriginList(envVar)) {
      set.add(origin);
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    set.add('http://localhost:3000');
    set.add('http://127.0.0.1:3000');
    set.add('http://localhost:5000');
    set.add('http://127.0.0.1:5000');
  }

  return [...set];
}

/**
 * Returns Helmet CSP `connectSrc` directives combining configured frontend & API origins.
 */
function getCspConnectSources() {
  const set = new Set(["'self'"]);

  for (const origin of getAllowedOrigins()) {
    set.add(origin);
  }

  const apiOrigin = (process.env.API_PUBLIC_ORIGIN || DEFAULT_API_ORIGIN).replace(/\/+$/, '');
  set.add(apiOrigin);
  const wsOrigin = apiOrigin.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  set.add(wsOrigin);
  set.add(`${wsOrigin}:3001`);

  if (process.env.CALL_SIGNAL_URL) {
    try {
      set.add(new URL(process.env.CALL_SIGNAL_URL).origin);
    } catch (_) {
      set.add(process.env.CALL_SIGNAL_URL);
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    set.add('ws://localhost:3001');
    set.add('ws://127.0.0.1:3001');
  }

  set.add('https://*.metered.ca');
  return [...set];
}

/**
 * Derives the WebSocket call signaling URL from `CALL_SIGNAL_URL`, `API_PUBLIC_ORIGIN`, or request host.
 *
 * @param {import('express').Request} [req]
 * @returns {string|null}
 */
function resolveWebSocketSignalUrl(req) {
  if (process.env.CALL_SIGNAL_URL) {
    return process.env.CALL_SIGNAL_URL;
  }

  const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
  if (!isProduction) {
    return null;
  }

  if (process.env.API_PUBLIC_ORIGIN) {
    const base = process.env.API_PUBLIC_ORIGIN.replace(/\/+$/, '');
    return `${base.replace(/^http/i, 'ws')}/api/v1/calls/ws`;
  }

  if (req && typeof req.get === 'function' && req.get('host')) {
    const host = req.get('host');
    const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').toLowerCase();
    const wsProto = proto === 'http' ? 'ws' : 'wss';
    return `${wsProto}://${host}/api/v1/calls/ws`;
  }

  return `${DEFAULT_API_ORIGIN.replace(/^http/i, 'ws')}/api/v1/calls/ws`;
}

/**
 * Resolves operational notification recipients strictly from configured environment variables.
 * Never returns unowned placeholder addresses.
 */
function getNotificationRecipients() {
  return {
    clinicalIntake:
      process.env.CLINICAL_INTAKE_EMAIL ||
      process.env.DEFAULT_CLINICAL_PARTNER_EMAIL ||
      null,
    whistleblower:
      process.env.WHISTLEBLOWER_NOTIFICATION_EMAIL ||
      process.env.DEFAULT_NOTIFICATION_RECIPIENT ||
      process.env.ADMIN_EMAIL ||
      process.env.SUPERADMIN_EMAIL ||
      null,
    admin:
      process.env.ADMIN_EMAIL ||
      process.env.SUPERADMIN_EMAIL ||
      process.env.DEFAULT_NOTIFICATION_RECIPIENT ||
      null,
  };
}

module.exports = {
  DEFAULT_CLIENT_ORIGIN,
  DEFAULT_API_ORIGIN,
  resolveAppBaseUrl,
  getAllowedOrigins,
  getCspConnectSources,
  resolveWebSocketSignalUrl,
  getNotificationRecipients,
};
