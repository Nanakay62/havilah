'use strict';

const express = require('express');
const router = express.Router();
const Referral = require('../models/Referral');
const logger = require('../utils/logger');
const { sensitiveRateLimiter } = require('../middleware/rateLimiter');

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const METERED_TIMEOUT_MS = 4000;
const METERED_CACHE_TTL_MS = 5 * 60 * 1000;
// Metered relay servers (private app). Cached in memory to avoid a round-trip per call.
let meteredCache = { servers: null, fetchedAt: 0 };

/**
 * Fetches the relay (TURN) server list from the private Metered app.
 * Serves a fresh cache when available and falls back to a stale cache if Metered is slow/unreachable.
 * @returns {Promise<Array|null>} Metered iceServers array, or null if unavailable
 */
async function getMeteredServers() {
  const apiKey = process.env.METERED_API_KEY;
  if (!apiKey) return null;

  const now = Date.now();
  if (meteredCache.servers && now - meteredCache.fetchedAt < METERED_CACHE_TTL_MS) {
    return meteredCache.servers;
  }

  try {
    const appName = process.env.METERED_APP_NAME || 'havilah';
    const response = await fetch(
      `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(METERED_TIMEOUT_MS) }
    );
    if (!response.ok) throw new Error(`Metered responded with HTTP ${response.status}`);
    const servers = await response.json();
    if (!Array.isArray(servers) || servers.length === 0) throw new Error('Metered returned an empty server list');
    meteredCache = { servers, fetchedAt: now };
    return servers;
  } catch (e) {
    logger.warn({ err: e.message, hasStaleCache: !!meteredCache.servers }, '[CallRoutes] Error fetching Metered credentials');
    return meteredCache.servers || null;
  }
}

/**
 * Optional self-hosted TURN override (TURN_URL, comma-separated). No public/shared default credentials.
 */
function getStaticTurnServers() {
  if (!process.env.TURN_URL || !process.env.TURN_USERNAME || !process.env.TURN_CREDENTIAL) return null;
  return [{
    urls: process.env.TURN_URL.split(',').map(s => s.trim()).filter(Boolean),
    username: process.env.TURN_USERNAME,
    credential: process.env.TURN_CREDENTIAL,
  }];
}

/**
 * @route   GET /api/v1/calls/ice-config?ref=CODE[,CODE2]
 * @desc    Returns STUN + private TURN relay configuration (Metered) and signaling endpoint.
 *          Requires at least one valid referral reference code to prevent relay credential abuse.
 * @access  Authenticated with referenceCode
 */
router.get('/ice-config', sensitiveRateLimiter(60), async (req, res) => {
  try {
    const codes = String(req.query.ref || '')
      .split(',')
      .map(c => c.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 100);

    if (codes.length === 0) {
      return res.status(400).json({ success: false, error: 'Reference code is required' });
    }

    const known = await Referral.exists({ referenceCode: { $in: codes } });
    if (!known) {
      return res.status(403).json({ success: false, error: 'Invalid reference code' });
    }

    const relayServers = (await getMeteredServers()) || getStaticTurnServers();
    const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;

    res.set('Cache-Control', 'no-store');

    if (!relayServers) {
      logger.error('[CallRoutes] No TURN relay available (METERED_API_KEY unset or Metered unreachable). Cross-network calls will fail.');
      if (isProduction) {
        return res.status(503).json({ success: false, error: 'Secure call relay is temporarily unavailable' });
      }
    }

    const defaultSignalUrl = isProduction
      ? 'wss://havilah-api.onrender.com/api/v1/calls/ws'
      : null;

    res.json({
      success: true,
      iceServers: [...STUN_SERVERS, ...(relayServers || [])],
      relayConfigured: !!relayServers,
      signalPort: parseInt(process.env.CALL_SIGNAL_PORT, 10) || 3001,
      signalUrl: process.env.CALL_SIGNAL_URL || defaultSignalUrl,
    });
  } catch (err) {
    logger.warn({ err: err.message }, '[CallRoutes] Error fetching ICE config');
    res.status(500).json({ success: false, error: 'Failed to retrieve connection settings' });
  }
});

/**
 * @route   POST /api/v1/calls/log
 * @desc    Log consultation call completion, duration, and notes to referral case
 * @access  Public / Authenticated via Reference Code
 */
router.post('/log', async (req, res, next) => {
  try {
    const { referenceCode, durationSeconds, callerRole, endReason, connectionPath } = req.body;

    if (!referenceCode) {
      return res.status(400).json({ success: false, error: 'Reference code is required' });
    }

    const referral = await Referral.findOne({ referenceCode: referenceCode.toUpperCase().trim() });
    if (!referral) {
      return res.status(404).json({ success: false, error: 'Referral case not found' });
    }

    const ALLOWED_PATHS = ['relay', 'srflx', 'prflx', 'host', 'unknown'];
    const safePath = ALLOWED_PATHS.includes(connectionPath) ? connectionPath : 'unknown';

    const minutes = Math.floor((durationSeconds || 0) / 60);
    const seconds = (durationSeconds || 0) % 60;
    const durationFormatted = `${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`;
    const pathText = safePath !== 'unknown' ? ` Path: ${safePath}.` : '';

    const logEntry = {
      sender: 'assessor',
      senderName: 'System Telehealth Logger',
      message: `[Encrypted Voice Consultation Completed] Duration: ${durationFormatted}.${pathText} Ended: ${endReason || 'Normal hangup'}.`,
      timestamp: new Date(),
    };

    referral.thread = referral.thread || [];
    referral.thread.push(logEntry);

    // If referral was scheduled, update appointment notes with timestamp
    if (referral.status === 'scheduled') {
      const prevNotes = referral.appointmentNotes ? `${referral.appointmentNotes} | ` : '';
      referral.appointmentNotes = `${prevNotes}Call held on ${new Date().toLocaleDateString('en-GB')} (${durationFormatted})`;
    }

    await referral.save();

    logger.info({ referenceCode, durationFormatted, connectionPath: safePath }, '[CallRoutes] Consultation call logged successfully');

    res.json({
      success: true,
      message: 'Consultation call logged successfully.',
      data: {
        referenceCode: referral.referenceCode,
        durationFormatted,
        connectionPath: safePath,
      }
    });
  } catch (err) {
    next(err);
  }
});

function __resetMeteredCache() {
  meteredCache = { servers: null, fetchedAt: 0 };
}

router.__resetMeteredCache = __resetMeteredCache;

module.exports = router;
