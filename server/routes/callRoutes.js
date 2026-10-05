'use strict';

const express = require('express');
const router = express.Router();
const Referral = require('../models/Referral');
const logger = require('../utils/logger');

/**
 * @route   GET /api/v1/calls/ice-config
 * @desc    Fetch STUN and TURN server credentials securely from environment
 * @access  Public / Authenticated with referenceCode
 */
router.get('/ice-config', async (req, res) => {
  try {
    const turnUsername = process.env.TURN_USERNAME || 'openrelay';
    const turnCredential = process.env.TURN_CREDENTIAL || 'openrelay';

    // Mobile carrier friendly TURN list:
    // Port 443 over TCP and TLS (TURNS) penetrates Carrier-Grade NAT (CGNAT) and mobile firewall UDP blocks
    const defaultTurnUrls = [
      'turns:openrelay.metered.ca:443?transport=tcp',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turn:openrelay.metered.ca:443',
      'turns:openrelay.metered.ca:5349?transport=tcp',
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:80?transport=tcp',
      'turn:openrelay.metered.ca:3478'
    ];

    let turnUrls = process.env.TURN_URL
      ? (process.env.TURN_URL.includes(',') ? process.env.TURN_URL.split(',').map(s => s.trim()) : [process.env.TURN_URL, ...defaultTurnUrls])
      : defaultTurnUrls;

    let iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:openrelay.metered.ca:80' },
      {
        urls: turnUrls,
        username: turnUsername,
        credential: turnCredential,
      }
    ];

    // Optional dynamic credentials via Metered API if configured
    if (process.env.METERED_API_KEY) {
      try {
        const appName = process.env.METERED_APP_NAME || 'havilah';
        const response = await fetch(`https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${process.env.METERED_API_KEY}`);
        if (response.ok) {
          const liveServers = await response.json();
          if (Array.isArray(liveServers) && liveServers.length > 0) {
            iceServers = [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun.cloudflare.com:3478' },
              ...liveServers
            ];
          }
        }
      } catch (e) {
        logger.warn({ err: e.message }, '[CallRoutes] Error fetching Metered live credentials');
      }
    }

    const defaultSignalUrl = (process.env.NODE_ENV === 'production' || process.env.RENDER)
      ? 'wss://havilah-api.onrender.com/api/v1/calls/ws'
      : null;

    res.json({
      success: true,
      iceServers,
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
    const { referenceCode, durationSeconds, callerRole, endReason } = req.body;

    if (!referenceCode) {
      return res.status(400).json({ success: false, error: 'Reference code is required' });
    }

    const referral = await Referral.findOne({ referenceCode: referenceCode.toUpperCase().trim() });
    if (!referral) {
      return res.status(404).json({ success: false, error: 'Referral case not found' });
    }

    const minutes = Math.floor((durationSeconds || 0) / 60);
    const seconds = (durationSeconds || 0) % 60;
    const durationFormatted = `${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`;

    const logEntry = {
      sender: 'assessor',
      senderName: 'System Telehealth Logger',
      message: `[Encrypted Voice Consultation Completed] Duration: ${durationFormatted}. Ended: ${endReason || 'Normal hangup'}.`,
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

    logger.info({ referenceCode, durationFormatted }, '[CallRoutes] Consultation call logged successfully');

    res.json({
      success: true,
      message: 'Consultation call logged successfully.',
      data: {
        referenceCode: referral.referenceCode,
        durationFormatted,
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
