'use strict';

const express = require('express');
const IssuedCertificate = require('../models/IssuedCertificate');
const { sensitiveRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const CERT_ID_PATTERN = /^HVL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/**
 * @route   GET /api/v1/certificates/verify/:certificateId
 * @desc    Public employer verification endpoint for issued Medical Excuse Duty Certificates.
 *          Rate-limited. Returns ONLY validity, issue date, and issuing clinic name.
 *          Never returns patient names, diagnoses, dates of leave, or any medical details.
 * @access  Public (Rate-limited)
 */
router.get('/verify/:certificateId', sensitiveRateLimiter(30), async (req, res, next) => {
  try {
    const rawId = String(req.params.certificateId || '').trim().toUpperCase();

    if (!rawId || !CERT_ID_PATTERN.test(rawId)) {
      return res.status(404).json({
        valid: false,
        certificateId: rawId || null,
      });
    }

    const record = await IssuedCertificate.findOne({ certificateId: rawId });
    if (!record || record.revoked) {
      return res.status(404).json({
        valid: false,
        certificateId: rawId,
      });
    }

    const intact = record.verifyIntegrity();
    if (!intact) {
      return res.status(404).json({
        valid: false,
        certificateId: rawId,
      });
    }

    return res.json({
      valid: true,
      certificateId: record.certificateId,
      issuedAt: record.issuedAt.toISOString(),
      clinicName: record.clinicName,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
